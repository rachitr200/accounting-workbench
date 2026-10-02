"""Optional SMTP adapter. Dry-run is default; never invoked by the browser or at startup."""
import argparse, os, smtplib, ssl
from email.message import EmailMessage
from email.utils import parseaddr
try:
    from .main import database, audit, now
except ImportError:
    from main import database, audit, now

def valid_address(address):
    parsed=parseaddr(address)[1]
    if parsed!=address or '@' not in parsed or any(ch in address for ch in '\r\n'):
        raise ValueError('Invalid address')
    domain=parsed.rsplit('@',1)[1].lower()
    if domain in {'localhost','example.com','example.org','example.net'} or domain.endswith(('.example','.test','.invalid','.localhost')):
        raise ValueError('Sample addresses cannot receive live messages')
    return parsed

def send_reviewed(ident=None,send=False):
    with database() as c:
        drafts=[dict(x) for x in c.execute("SELECT * FROM drafts WHERE status='Reviewed'"+(" AND id=?" if ident else ''),(ident,) if ident else ())]
    if not send:return [{'id':d['id'],'subject':d['subject'],'action':'dry-run; nothing sent'} for d in drafts]
    if not ident or len(drafts)!=1:raise ValueError('Sending requires one explicit reviewed draft ID')
    if os.environ.get('SMTP_ENABLED')!='true':raise ValueError('Set SMTP_ENABLED=true only after authorizing live sending')
    d=drafts[0]
    recipient=valid_address(d['recipient']);sender=valid_address(os.environ.get('SMTP_FROM',''))
    host=os.environ.get('SMTP_HOST','');username=os.environ.get('SMTP_USERNAME','');password=os.environ.get('SMTP_PASSWORD','')
    if not host or not username or not password:raise ValueError('SMTP host, username and password are required')
    port=int(os.environ.get('SMTP_PORT','465'))
    if port not in {465,587}:raise ValueError('Use TLS port 465 or STARTTLS port 587')
    msg=EmailMessage();msg['From']=sender;msg['To']=recipient;msg['Subject']=d['subject'];msg['Message-ID']=f'<workbench-{d["id"]}@{sender.rsplit("@",1)[1]}>';msg.set_content(d['body'])
    # Claim before network I/O. An interrupted/uncertain attempt is never automatically retried.
    with database(True) as c:
        changed=c.execute("UPDATE drafts SET status='Sending' WHERE id=? AND status='Reviewed'",(ident,)).rowcount
        if changed!=1:raise ValueError('Draft state changed; review it again')
        audit(c,'SMTP send started',ident)
    try:
        context=ssl.create_default_context()
        if port==465:
            connection=smtplib.SMTP_SSL(host,port,context=context,timeout=30)
        else:
            connection=smtplib.SMTP(host,port,timeout=30);connection.ehlo();connection.starttls(context=context);connection.ehlo()
        with connection as smtp:
            smtp.login(username,password)
            refused=smtp.send_message(msg)
            if refused:raise RuntimeError('Recipient refused')
        with database(True) as c:
            c.execute("UPDATE drafts SET status='Sent' WHERE id=?",(ident,));audit(c,'SMTP accepted message',ident+'; server acceptance is not a delivery receipt')
        return [{'id':ident,'action':'SMTP accepted; delivery not independently verified'}]
    except Exception:
        with database(True) as c:
            c.execute("UPDATE drafts SET status='Needs review' WHERE id=?",(ident,));audit(c,'SMTP outcome requires review',ident+'; check provider logs before any manual retry')
        raise RuntimeError('Sending failed or its outcome is uncertain. Check provider logs; no automatic retry was performed.') from None

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--id',help='One reviewed draft ID')
    parser.add_argument('--send',action='store_true',help='Explicitly send the selected draft using configured SMTP')
    args=parser.parse_args()
    for result in send_reviewed(args.id,args.send):print(result)
