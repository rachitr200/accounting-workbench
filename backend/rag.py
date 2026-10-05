"""Workspace-scoped semantic retrieval with FastEmbed and embedded Qdrant."""
import hashlib
import json
import os
import threading
import uuid
from functools import lru_cache
from pathlib import Path

from qdrant_client import QdrantClient, models

MODEL = 'sentence-transformers/all-MiniLM-L6-v2'
DIMENSIONS = 384
COLLECTION = 'approved_passages_v1'
# Embedded Qdrant is single-process. Bound concurrency, model RAM and file handles.
LOCK = threading.RLock()
MAX_SOURCES = 40
MAX_CHUNKS = 1200
MIN_SCORE = 0.35

class RetrievalUnavailable(Exception):
    pass

@lru_cache(maxsize=1)
def embedding_model():
    from fastembed import TextEmbedding
    return TextEmbedding(model_name=MODEL, threads=1,
                         cache_dir=os.environ.get('FASTEMBED_CACHE_PATH'),
                         local_files_only=os.environ.get('RAG_OFFLINE') == 'true')

def embed_documents(texts):
    return [v.tolist() for v in embedding_model().passage_embed(texts, batch_size=2)]

def embed_query(text):
    return next(embedding_model().query_embed(text)).tolist()

def fingerprint(source):
    return hashlib.sha256(json.dumps(source, sort_keys=True).encode()).hexdigest()

def split_source(source):
    text=source['body']; chunks=[]; start=0
    while start<len(text):
        end=min(start+850,len(text))
        if end<len(text):
            boundary=text.rfind(' ',start+600,end)
            if boundary>start:end=boundary
        excerpt=text[start:end].strip()
        if excerpt:
            i=len(chunks)
            chunks.append({'id':source['id'],'chunk_id':source['id']+'_'+str(i),
                           'title':source['title'],'source_url':source['source_url'],
                           'jurisdiction':source['jurisdiction'],'tax_year':source['tax_year'],
                           'excerpt':excerpt,'start':start,'end':end,
                           'fingerprint':fingerprint(source)})
        if end==len(text):break
        start=end-120
    return chunks

def vector_path(db_path):
    # Database path is selected by the server's signed session, never caller input.
    return Path(str(db_path)+'.vectors')

def sync_index(client, path, sources):
    approved=sorted([s for s in sources if s['approved']],key=lambda s:s['id'])
    if len(approved)>MAX_SOURCES:
        raise RetrievalUnavailable('Semantic retrieval supports at most 40 approved sources per demo workspace.')
    revision=hashlib.sha256((MODEL+json.dumps(approved,sort_keys=True)).encode()).hexdigest()
    manifest=path/'manifest.json'
    try:current=json.loads(manifest.read_text())
    except (OSError,ValueError):current={}
    if current.get('revision')==revision and client.collection_exists(COLLECTION):return current
    chunks=[chunk for source in approved for chunk in split_source(source)]
    if len(chunks)>MAX_CHUNKS:raise RetrievalUnavailable('Source library exceeds the demo passage limit.')
    # Compute all vectors before replacing the collection. Failed generation leaves no valid manifest.
    vectors=embed_documents([p['title']+'\n'+p['excerpt'] for p in chunks]) if chunks else []
    if client.collection_exists(COLLECTION):client.delete_collection(COLLECTION)
    client.create_collection(COLLECTION,vectors_config=models.VectorParams(size=DIMENSIONS,distance=models.Distance.COSINE))
    if chunks:
        client.upsert(COLLECTION,points=[models.PointStruct(
            id=str(uuid.uuid5(uuid.NAMESPACE_URL,p['chunk_id'])),vector=v,payload=p)
            for p,v in zip(chunks,vectors)],wait=True)
    result={'revision':revision,'model':MODEL,'dimensions':DIMENSIONS,'sources':len(approved),'chunks':len(chunks),'database':'Qdrant embedded'}
    temp=manifest.with_suffix('.tmp');temp.write_text(json.dumps(result));temp.replace(manifest)
    return result

def retrieve(db_path,sources,question,jurisdiction,tax_year,rebuild_only=False):
    path=vector_path(db_path)
    with LOCK:
        client=None
        try:
            client=QdrantClient(path=str(path),force_disable_check_same_thread=True)
            info=sync_index(client,path,sources)
            if rebuild_only:return info
            if not info['chunks']:return [],info
            hits=client.query_points(COLLECTION,query=embed_query(question),
                query_filter=models.Filter(must=[
                    models.FieldCondition(key='jurisdiction',match=models.MatchValue(value=jurisdiction)),
                    models.FieldCondition(key='tax_year',match=models.MatchValue(value=tax_year))]),
                limit=4,score_threshold=MIN_SCORE).points
            # Recheck authority against SQLite even if an index has stale points.
            current={s['id']:s for s in sources if s['approved'] and s['jurisdiction']==jurisdiction and s['tax_year']==tax_year}
            results=[]
            for hit in hits:
                p=hit.payload
                if p['id'] in current and p['fingerprint']==fingerprint(current[p['id']]):
                    results.append({k:v for k,v in p.items() if k!='fingerprint'} | {'score':round(hit.score,4)})
            return results,info
        except RetrievalUnavailable:raise
        except Exception as exc:
            raise RetrievalUnavailable('Semantic index is unavailable. Retry or choose keyword search.') from exc
        finally:
            if client is not None:client.close()
