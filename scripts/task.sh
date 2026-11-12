#!/usr/bin/env bash
# Per-role task tracking. Edits equipo/tasks/{A,B,C,D,team}.md deterministically (agents call this
# instead of hand-editing; hand edits still parse). Python 3 standard library only, run isolated (-I).
#
#   task.sh list [role] [--open]          role: A|B|C|D|team (default: all); a role also shows team tasks that name it
#   task.sh next <role>                   first todo whose dependencies are all done (plus tasks in progress)
#   task.sh start <id>                    status doing
#   task.sh done <id> [--evidence <text>] status done
#   task.sh block <id> <reason>           status blocked, reason stored in the evidence/note cell
#   task.sh add <role> <title> --acceptance <text> [--milestone M1..M6] [--due <text>] [--deps A-01,B-02] [--owner <text>]
#   task.sh show <id>                     all fields of one task
#   task.sh status <id>                   prints todo|doing|blocked|done|unknown (used by CI)
#   task.sh brief [who|role]              compact overview for session start (no arg: all roles)
#   task.sh who [--session <id>]          resolved "<role> <name> <ack-file>" (env SHELFIE_WHO, else the ack)
# Stamps "last update" with date, time (Europe/Berlin) and $TASK_ACTOR, else git user.name, else $USER.
# Env: TASK_DIR overrides the tasks folder (tests); SHELFIE_WHO=isabel|fernando|lorenz|helmut|A..D.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
export TASK_ROOT="$ROOT"
if [[ $# -eq 0 || "$1" == help || "$1" == -h || "$1" == --help ]]; then sed -n '2,19p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; [[ $# -gt 0 ]]; exit; fi
command -v python3 >/dev/null || { echo "task.sh: python3 is required" >&2; exit 69; }
exec python3 -I - "$@" <<'PY'
import fcntl, os, re, subprocess, sys, tempfile, time

ROOT = os.environ["TASK_ROOT"]
TDIR = os.environ.get("TASK_DIR") or os.path.join(ROOT, "equipo", "tasks")
os.environ["TZ"] = "Europe/Berlin"
try:
    time.tzset()
except AttributeError:
    pass

COLS = ["id", "status", "title", "owner", "deps", "ms", "due", "acceptance", "evidence", "updated"]
STATUSES = ("todo", "doing", "blocked", "done")
FILES = {"A": "A.md", "B": "B.md", "C": "C.md", "D": "D.md", "T": "team.md"}
NAMES = {"A": "Isabel", "B": "Fernando", "C": "Lorenz", "D": "Helmut"}
PERSON = {"isabel": "A", "fernando": "B", "lorenz": "C", "helmut": "D"}
PAIR = {"A": "B", "B": "A", "C": "D", "D": "C"}
ROW = re.compile(r"^\|\s*([A-DT]-\d{2,3})\s*\|")
HEADER = (
    "| id | status | title | owner | deps | ms | due | acceptance | evidence | updated |\n"
    "|---|---|---|---|---|---|---|---|---|---|\n"
)


def die(msg, code=1):
    print("task.sh: " + msg, file=sys.stderr)
    sys.exit(code)


def clean(s):
    return re.sub(r"\s+", " ", str(s).replace("|", "/")).strip() or "-"


def actor():
    a = os.environ.get("TASK_ACTOR", "").strip()
    if not a:
        try:
            a = subprocess.run(["git", "-C", ROOT, "config", "user.name"], capture_output=True,
                               text=True, timeout=3).stdout.strip()
        except Exception:
            a = ""
    return clean(a or os.environ.get("USER", "unknown"))


def stamp():
    return time.strftime("%Y-%m-%d %H:%M") + " " + actor()


def role_key(r):
    r = (r or "").strip()
    if r.lower() in ("team", "t", "shared"):
        return "T"
    if r.upper() in "ABCD" and len(r) == 1:
        return r.upper()
    if r.lower() in PERSON:
        return PERSON[r.lower()]
    return None


def path_of(k):
    return os.path.join(TDIR, FILES[k])


def read_lines(k):
    p = path_of(k)
    if not os.path.exists(p):
        return []
    with open(p, encoding="utf-8") as f:
        return f.read().split("\n")


def parse_row(line):
    cells = [c.strip() for c in line.strip().strip("|").split("|")]
    cells = (cells + ["-"] * len(COLS))[: len(COLS)]
    return dict(zip(COLS, cells))


def fmt_row(t):
    return "| " + " | ".join(clean(t[c]) if c != "id" else t[c] for c in COLS) + " |"


def load():
    tasks = []
    for k in "ABCDT":
        for i, line in enumerate(read_lines(k)):
            if ROW.match(line):
                t = parse_row(line)
                t["status"] = t["status"].lower()
                t["_k"], t["_i"] = k, i
                tasks.append(t)
    return tasks


def by_id(tasks, tid):
    for t in tasks:
        if t["id"] == tid.upper():
            return t
    return None


def mine(tasks, k):
    """Tasks that concern role k: its own file plus team tasks whose owner names it."""
    out = []
    for t in tasks:
        if t["_k"] == k:
            out.append(t)
        elif t["_k"] == "T" and (k == "T" or "all" in t["owner"].lower() or k in re.sub(r"[^A-D]", "", t["owner"])):
            out.append(t)
    return out


def dep_ids(t):
    return [d.strip().upper() for d in re.split(r"[,\s]+", t["deps"]) if re.match(r"^[A-DT]-\d+$", d.strip().upper())]


def unmet(t, tasks):
    res = []
    for d in dep_ids(t):
        x = by_id(tasks, d)
        if x is None or x["status"] != "done":
            res.append(d)
    return res


def line_of(t, tasks=None):
    extra = ""
    if t["status"] == "todo" and tasks is not None:
        u = unmet(t, tasks)
        if u:
            extra = "  waits:" + ",".join(u)
    note = ""
    if t["status"] == "blocked" and t["evidence"] not in ("", "-"):
        note = "  (" + t["evidence"] + ")"
    return "%-5s %-7s %-3s %-9s %s [%s]%s%s" % (
        t["id"], t["status"], t["ms"], t["due"], t["title"], t["owner"], extra, note)


class Locked:
    def __enter__(self):
        os.makedirs(TDIR, exist_ok=True)
        self.fd = os.open(TDIR, os.O_RDONLY)
        try:
            fcntl.flock(self.fd, fcntl.LOCK_EX)
        except OSError:
            pass
        return self

    def __exit__(self, *a):
        os.close(self.fd)


def write_lines(k, lines):
    p = path_of(k)
    fd, tmp = tempfile.mkstemp(dir=TDIR, prefix=".tmp-")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    os.chmod(tmp, 0o644)
    os.replace(tmp, p)


def update(tid, fn):
    with Locked():
        tasks = load()
        t = by_id(tasks, tid)
        if t is None:
            die("unknown task id " + tid, 2)
        fn(t, tasks)
        t["updated"] = stamp()
        lines = read_lines(t["_k"])
        lines[t["_i"]] = fmt_row(t)
        write_lines(t["_k"], lines)
        print(line_of(t))


def parse_opts(args, flags):
    pos, opts, i = [], {}, 0
    while i < len(args):
        a = args[i]
        if a in flags:
            if i + 1 >= len(args):
                die("missing value for " + a, 64)
            opts[a] = args[i + 1]
            i += 2
        else:
            pos.append(a)
            i += 1
    return pos, opts


def cmd_list(args):
    open_only = "--open" in args
    args = [a for a in args if a != "--open"]
    tasks = load()
    sel = tasks
    if args:
        k = role_key(args[0])
        if not k:
            die("unknown role " + args[0], 64)
        sel = mine(tasks, k)
    for t in sel:
        if open_only and t["status"] == "done":
            continue
        print(line_of(t, tasks))


def ready(sel, tasks):
    return [t for t in sel if t["status"] == "todo" and not unmet(t, tasks)]


def cmd_next(args):
    if not args:
        die("usage: next <role>", 64)
    k = role_key(args[0])
    if not k:
        die("unknown role " + args[0], 64)
    tasks = load()
    sel = mine(tasks, k)
    for t in sel:
        if t["status"] == "doing":
            print("in progress: " + line_of(t))
    for t in sel:
        if t["status"] == "blocked":
            print("blocked:     " + line_of(t))
    r = ready(sel, tasks)
    if r:
        t = r[0]
        print("next:        " + line_of(t))
        print("acceptance:  " + t["acceptance"])
        print("start with:  bash scripts/task.sh start " + t["id"])
    else:
        waiting = [t for t in sel if t["status"] == "todo"]
        print("no ready todo for %s (%d todo waiting on dependencies)" % (args[0].upper(), len(waiting)))


def cmd_start(args):
    if not args:
        die("usage: start <id>", 64)
    force = "--force" in args
    tid = [a for a in args if a != "--force"][0]

    def fn(t, tasks):
        if t["status"] == "done" and not force:
            die("%s is already done (use --force to reopen)" % t["id"], 3)
        u = unmet(t, tasks)
        if u:
            print("warning: %s depends on unfinished %s" % (t["id"], ",".join(u)), file=sys.stderr)
        t["status"] = "doing"
        if t["evidence"].lower().startswith("blocked:"):
            t["evidence"] = "-"
    update(tid, fn)


def cmd_done(args):
    pos, opts = parse_opts(args, ("--evidence",))
    if not pos:
        die("usage: done <id> [--evidence <text>]", 64)

    def fn(t, tasks):
        t["status"] = "done"
        if "--evidence" in opts:
            t["evidence"] = opts["--evidence"]
        elif t["evidence"].lower().startswith("blocked:"):
            t["evidence"] = "-"
    update(pos[0], fn)


def cmd_block(args):
    if len(args) < 2:
        die("usage: block <id> <reason>", 64)

    def fn(t, tasks):
        t["status"] = "blocked"
        t["evidence"] = "blocked: " + " ".join(args[1:])
    update(args[0], fn)


def cmd_add(args):
    pos, opts = parse_opts(args, ("--acceptance", "--milestone", "--due", "--deps", "--owner"))
    if len(pos) < 2:
        die("usage: add <role> <title> --acceptance <text> [--milestone M] [--due D] [--deps ids] [--owner O]", 64)
    k = role_key(pos[0])
    if not k:
        die("unknown role " + pos[0], 64)
    if "--acceptance" not in opts or not opts["--acceptance"].strip():
        die("--acceptance is required (one testable line)", 64)
    ms = opts.get("--milestone", "-").upper()
    if ms != "-" and not re.match(r"^M[1-6]$", ms):
        die("milestone must be M1..M6", 64)
    with Locked():
        tasks = load()
        for d in [x for x in re.split(r"[,\s]+", opts.get("--deps", "")) if x]:
            if by_id(tasks, d) is None:
                die("unknown dependency " + d, 2)
        nums = [int(t["id"].split("-")[1]) for t in tasks if t["_k"] == k]
        tid = "%s-%02d" % (k, max(nums or [0]) + 1)
        owner = opts.get("--owner") or (NAMES[k] if k in NAMES else "all")
        t = {"id": tid, "status": "todo", "title": " ".join(pos[1:]) if len(pos) > 2 else pos[1],
             "owner": owner, "deps": opts.get("--deps", "-").replace(" ", ""), "ms": ms,
             "due": opts.get("--due", "-"), "acceptance": opts["--acceptance"], "evidence": "-",
             "updated": stamp()}
        lines = read_lines(k)
        if not lines:
            title = "# Tasks - " + ("shared tasks" if k == "T" else "role " + k)
            lines = [title, "", HEADER.rstrip("\n"), ""]
        last = max([i for i, l in enumerate(lines) if ROW.match(l)] or
                   [i for i, l in enumerate(lines) if re.match(r"^\|[-\s|]+\|\s*$", l)] or [len(lines) - 1])
        lines.insert(last + 1, fmt_row(t))
        write_lines(k, lines)
        print(fmt_row(t))


def cmd_show(args):
    if not args:
        die("usage: show <id>", 64)
    tasks = load()
    t = by_id(tasks, args[0])
    if t is None:
        die("unknown task id " + args[0], 2)
    for c in COLS:
        print("%-10s %s" % (c + ":", t[c]))
    u = unmet(t, tasks)
    if u:
        print("%-10s %s" % ("waits on:", ",".join(u)))


def cmd_status(args):
    if not args:
        die("usage: status <id>", 64)
    t = by_id(load(), args[0])
    print(t["status"] if t else "unknown")


def acks():
    d = os.path.join(ROOT, ".claude", "state")
    out = []
    if os.path.isdir(d):
        for n in os.listdir(d):
            if n.startswith("ack-"):
                p = os.path.join(d, n)
                kv = {}
                try:
                    with open(p, encoding="utf-8") as f:
                        for l in f:
                            if "=" in l:
                                a, b = l.rstrip("\n").split("=", 1)
                                kv[a] = b
                    out.append((os.path.getmtime(p), p, n[4:], kv))
                except OSError:
                    pass
    return sorted(out, reverse=True)


def resolve_who(session=""):
    """Returns (role, ackpath). Order: env SHELFIE_WHO; the session's ack; the newest ack with a name."""
    allacks = acks()
    ackpath = ""
    for m, p, sid, kv in allacks:
        if session and sid == session:
            ackpath = p
            break
    if not ackpath and allacks:
        ackpath = allacks[0][1]
    env = os.environ.get("SHELFIE_WHO", "").strip()
    if env and role_key(env) in NAMES:
        return role_key(env), ackpath
    for m, p, sid, kv in allacks:
        if session and sid == session and role_key(kv.get("who", "")) in NAMES:
            return role_key(kv["who"]), ackpath
    for m, p, sid, kv in allacks:
        if role_key(kv.get("who", "")) in NAMES:
            return role_key(kv["who"]), ackpath
    return "", ackpath


def cmd_who(args):
    pos, opts = parse_opts(args, ("--session",))
    role, ack = resolve_who(opts.get("--session", ""))
    print("%s %s %s" % (role or "-", NAMES.get(role, "-").lower(), ack or "-"))


def counts(sel):
    c = {s: 0 for s in STATUSES}
    for t in sel:
        c[t["status"]] = c.get(t["status"], 0) + 1
    return c


def cmd_brief(args):
    tasks = load()
    if not tasks:
        print("Tasks: none yet (equipo/tasks/).")
        return
    k = role_key(args[0]) if args else ""
    if args and k in NAMES:
        sel = mine(tasks, k)
        c = counts(sel)
        print("Tasks for %s (%s): %d doing, %d blocked, %d todo, %d done." % (
            k, NAMES[k], c["doing"], c["blocked"], c["todo"], c["done"]))
        shown = [t for t in sel if t["status"] in ("doing", "blocked")]
        r = ready(sel, tasks)
        for t in shown + r[:4]:
            print("  " + line_of(t, tasks))
        pb = [t for t in mine(tasks, PAIR[k]) if t["status"] == "blocked" and t not in sel]
        for t in pb[:3]:
            print("  pair blocked: " + line_of(t))
        if r:
            print("Next: %s. Work blocks start with 'bash scripts/task.sh next %s' and end with start/done/block/add (AGENTS.md, Task tracking)." % (r[0]["id"], k))
        else:
            print("Next: no ready todo. Use 'bash scripts/task.sh list %s --open'." % k)
        return
    print("Tasks (set SHELFIE_WHO or run context-ack.sh --who for your own list; 'bash scripts/task.sh next <A-D>'):")
    for kk in "ABCD":
        sel = mine(tasks, kk)
        c = counts(sel)
        r = ready(sel, tasks)
        print("  %s %-8s doing %d, blocked %d, todo %d, done %d; next %s" % (
            kk, NAMES[kk], c["doing"], c["blocked"], c["todo"], c["done"],
            (r[0]["id"] + " " + r[0]["title"][:50]) if r else "-"))


CMDS = {"list": cmd_list, "next": cmd_next, "start": cmd_start, "done": cmd_done, "block": cmd_block,
        "add": cmd_add, "show": cmd_show, "status": cmd_status, "brief": cmd_brief, "who": cmd_who}

if __name__ == "__main__":
    a = sys.argv[1:]
    if a[0] not in CMDS:
        die("unknown command " + a[0], 64)
    CMDS[a[0]](a[1:])
PY
