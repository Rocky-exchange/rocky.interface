import json, os, sys, urllib.request

BASE = "https://open.larksuite.com/open-apis"
APP_ID = os.environ["LARK_APP_ID"]; APP_SECRET = os.environ["LARK_APP_SECRET"]
CHAT = os.environ["LARK_CHAT_ID"]; MID = os.environ.get("MESSAGE_ID", "").strip()
PHASE = os.environ.get("PHASE", "deploying")
JOB = os.environ.get("JOB_NAME", "job"); BUILD = os.environ.get("BUILD_NUMBER", "?")
BRANCH = os.environ.get("BRANCH", "dev"); ENVIRON = os.environ.get("DEPLOY_ENV", "test")
HOST = os.environ.get("DEPLOY_HOST", ""); COMMIT = os.environ.get("COMMIT", "-")
TRIGGER = os.environ.get("TRIGGER", "System/Auto"); URL = os.environ.get("BUILD_URL", "")
DURATION = os.environ.get("DURATION", ""); SVC = os.environ.get("SVC", "")
STATUSLABEL = os.environ.get("STATUS", "")
HEADER_TITLE = os.environ.get("HEADER_TITLE", "部署进度")
ITEMS_HEADER = os.environ.get("ITEMS_HEADER", "服务启动进度")

def req(method, url, tok=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Content-Type", "application/json; charset=utf-8")
    if tok:
        r.add_header("Authorization", "Bearer " + tok)
    try:
        return json.loads(urllib.request.urlopen(r, timeout=10).read())
    except Exception as e:
        return {"code": -1, "msg": str(e)}

META = {"init": ("blue", "🚀", "部署中"), "deploying": ("blue", "⏳", "部署中"),
        "success": ("green", "✅", "部署成功"), "failure": ("red", "❌", "部署失败")}
color, icon, defstate = META.get(PHASE, META["deploying"])
state = STATUSLABEL or defstate
if DURATION:
    state = f"{state} · 总耗时 {DURATION}"

lines = []
total = 0; up = 0
if SVC:
    for pair in SVC.split(","):
        pair = pair.strip()
        if not pair:
            continue
        name, _, st = pair.partition(":")
        total += 1
        if st == "running":
            up += 1; mark = "✅"
        elif st in ("restarting", "paused", "dead", "exited"):
            mark = "🔄"
        else:
            mark = "⏳"
        lines.append(f"{mark} {name}")
head = f"**{ITEMS_HEADER} ({up}/{total})**\n" if total else f"**{ITEMS_HEADER}**\n"
svc_block = head + ("\n".join(lines) if lines else "⏳ 准备中…")

card = {"config": {"wide_screen_mode": True},
        "header": {"template": color, "title": {"tag": "plain_text", "content": f"{icon} {HEADER_TITLE} | {JOB} #{BUILD}"}},
        "elements": [
            {"tag": "div", "fields": [
                {"is_short": True, "text": {"tag": "lark_md", "content": f"**环境**\n{ENVIRON} ({HOST})"}},
                {"is_short": True, "text": {"tag": "lark_md", "content": f"**分支**\n`{BRANCH}`"}},
                {"is_short": True, "text": {"tag": "lark_md", "content": f"**Commit**\n`{COMMIT}`"}},
                {"is_short": True, "text": {"tag": "lark_md", "content": f"**触发**\n{TRIGGER}"}}]},
            {"tag": "div", "text": {"tag": "lark_md", "content": f"**状态**: {state}"}},
            {"tag": "hr"},
            {"tag": "div", "text": {"tag": "lark_md", "content": svc_block}},
            {"tag": "hr"},
            {"tag": "action", "actions": [{"tag": "button", "text": {"tag": "plain_text", "content": "查看 Jenkins 构建详情"}, "url": URL, "type": "primary"}]}]}

tok = req("POST", BASE + "/auth/v3/tenant_access_token/internal",
          body={"app_id": APP_ID, "app_secret": APP_SECRET}).get("tenant_access_token")
if not MID:
    r = req("POST", BASE + "/im/v1/messages?receive_id_type=chat_id", tok,
            {"receive_id": CHAT, "msg_type": "interactive", "content": json.dumps(card)})
    sys.stderr.write(f"send code={r.get('code')} {r.get('msg')}\n")
    sys.stdout.write(r.get("data", {}).get("message_id", "") if r.get("code") == 0 else "")
else:
    r = req("PATCH", BASE + f"/im/v1/messages/{MID}", tok,
            {"msg_type": "interactive", "content": json.dumps(card)})
    sys.stderr.write(f"patch code={r.get('code')} {r.get('msg')}\n")
    sys.stdout.write(MID)
