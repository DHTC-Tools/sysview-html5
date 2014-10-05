#!/usr/bin/env python
#
# $Id$

CLUSTER_IDS=["MWT2", "UC", "IU", "ICC", "UC3", "UCT3", "ITB"]
#CLUSTER_IDS=["MWT2", "UC", "IU", "ICC", "UC3", "UCT3"]
#CLUSTER_IDS=["MWT2_UC", "MWT2"]

MC_HOSTLIST=['mc.mwt2.org:11211']
JSON_PATH = "/var/local/sysview/sys/view/mosaic.json"

margin=10
size=14
spacing=2
border_width=8
columns=80

#pink   = 255, 192, 203
pink    = 255, 110, 110
yellow  = 255, 255,   0
red     = 255,   0,   0
purple  = 128,   0, 128
fuschia = 255,   0, 255
violet  = 238, 130, 238

black   =   0,   0,   0
grey    = 128, 128, 128
white   = 255, 255, 255


import os, sys, re
import time, datetime
import memcache
try: import simplejson as json
except ImportError: import json

print_times = False
verbose = False
verbose = 0

for x in sys.argv:
    if x.startswith('-v'):
        verbose = x.count('v')
        print "verbose enabled"
    if x.startswith('-t'):
        print_times = True
        if verbose:
            print "timing enabled"

mc = None

def mc_init():
    global mc
    if not mc:
        mc = memcache.Client(MC_HOSTLIST)
        
def mc_get(key):
    mc_init()
    try:
        r = mc.get(key)
    except:
        r = None
    if verbose > 1:
        print "GET", key, r
    return r


def mc_get_multi(k):
    mc_init()
    try:
        d = mc.get_multi(k)
    except:
        pass
    if verbose > 1:
        print "GET multi", d
    return d


TTL = 2 * 24 * 3600 ## 2 days
def mc_set(key, val, ttl=TTL):
    mc_init()
    try:
        mc.set(key, val, ttl)
    except:
        pass
    if verbose > 1:
        print "SET", key, val


class Timer:
    def __init__(self, name):
        self.name = name
        self.t0 = time.time()
    def end(self):
        if print_times:
            print self
    def __str__(self):
        return "%s %.2gs" % (self.name, time.time() - self.t0)        

main_timer = Timer("overall")

# Poor man's lock
p=os.popen('ps ax|grep mosaic_render.py|grep python|grep -v grep|wc -l')
n = int(p.read())
if n > 1:
    if verbose: print "another mosaic_render instance is running, exiting"
    sys.exit(1)
p.close()


def hsl2rgb(h,s,l):
##  http://en.wikipedia.org/wiki/HSL_and_HSV#Conversion_from_HSL_to_RGB
    if l < 0.5:
        q = l * (1+s)
    else:
        q = l + s - (l*s)
    p = 2*l - q
    hk = h/360.0
    t = [(hk + 1/.3) % 1 , hk % 1, (hk - 1/3.)%1]
    r = []
    for tc in t:
        if tc < 1/6.:
            c = p + (q-p)*6*tc
        elif 1/6. <= tc < 1/2.:
            c = q
        elif 1/2. <= tc < 2/3.:
            c = p + ((q-p)*6*((2/3.) - tc))
        else:
            c = p
        r.append(c)
    r = map(lambda x: int(x*255), r)
    return r

def rgb(wsecs, csecs):
    if wsecs==csecs==0:
        return 128,128,128 # No info # ???
    #if wsecs >= 604800: # a week old!
    #    return 0, 0, 255# very blue
    if wsecs < 60:  # New jobs are white
        return white
    eff = float(csecs)/wsecs
    ## hsl coding
    green = 120.0
    blue = 220.0

    if wsecs > 600:
        h = blue + eff*(green-blue)
    else:
        h = green
    s = 1
    t = min( wsecs/7200.0, 1)  # 2 hours
    l = 0.6 - 0.4*t
    return hsl2rgb(h, s, l)

def HMS(x):
    x = int(x)
    s, x = x%60, int(x/60)
    m, x = x%60, int(x/60)
    return "%02d:%02d:%02d" % (x,m,s)


def cmp_node(a,b): # put UC ahead of IU, since people are used to this
    if a.startswith('uc') and b.startswith('iu'):
        return -1
    if a.startswith('iu') and b.startswith('uc'):
        return 1
    return cmp(a,b)

def shortname(host):
    return host.split('.')[0]

nodes = []
jobs = []

timer = Timer("get node and job list")
for CLUSTER_ID in CLUSTER_IDS:
    nodes_tmp = mc_get(CLUSTER_ID+'.nodes')
    if nodes_tmp is None:
        print 'No %s.nodes key in memcache; skipping %s' % (CLUSTER_ID, CLUSTER_ID)
        continue
    try:
       nodes_tmp.sort(cmp_node)
    except AttributeError, e:
        print CLUSTER_ID, e
        continue
    nodes.extend(nodes_tmp)
    jobs.extend(mc_get(CLUSTER_ID+'.running_jobs'))

del nodes_tmp

timer.end()

timer = Timer("get node info")
keys = []
for node in nodes:
    keys.append(shortname(node)+".info")
node_info = mc_get_multi(keys)
timer.end()

timer = Timer("get job info")
job_times = mc_get_multi(["%s.times"%j for j in jobs])
job_prev_times = mc_get_multi(["%s.prev_times"%j for j in jobs])
job_users = mc_get_multi(["%s.user"%j for j in jobs])
job_cpus = mc_get_multi(["%s.cpus"%j for j in jobs])

job_mem = mc_get_multi(["%s.mem"%j for j in jobs])
job_types = mc_get_multi(["%s.type"%j for j in jobs])
job_panda = mc_get_multi(["%s.panda_id"%j for j in jobs])
panda_info = mc_get_multi(["%s.info"%p for p in job_panda.values()])

timer.end()

# For each square:
# name, (rgb), dot_type, comment, url
data = []

keys = []
for node in nodes:
    name = shortname(node)
    np, manual_state, load, manual_msg = node_info.get(name + '.info')
    for slot in xrange(1,np+1):
        keys.append("%s.%d" % (name, slot))


timer = Timer("get job slot info")
slot_info = mc_get_multi(keys)
timer.end()

timer = Timer("munge data")
keys = []
for node in nodes:

    hostname = shortname(node)

    # These values are set into "hostname.info" by mosaic_backend_xxx.py
    ncpu, manual_state, load, manual_msg = node_info.get(hostname + '.info')

    # Pull out the last changed information
    manual_user      = mc_get(hostname + '.manualuser')
    manual_timestamp = mc_get(hostname + '.manualtimestamp')

    if manual_user:
        updated_user = manual_user
    else:
        updated_user = 'Unknown'

    if manual_timestamp:
        updated_time = datetime.datetime.fromtimestamp(int(manual_timestamp)).strftime('%Y-%m-%d %H:%M:%S')
    else:
        updated_time = 'Unknown'


    # Fetch the node state as put into memcache by condor_node_offline.sh
    node_state = mc_get(hostname + '.status')

    # If we have a state, get the message
    # If none, assume the node is dead
    if node_state:
        node_msg = mc_get(hostname + '.message')
    else:
        node_state = 'dead'
        node_msg = ''

    # Fetch the timestamp as put into memcache by condor_node_offline.sh
    node_timestamp = mc_get(hostname + '.timestamp')

    # If we have a timestamp, determine how long since the last report
    # If too long (15 min), mark the node down
    # If there is no timestamp, mark the node as dead
    if node_timestamp:
        node_int = int(time.time()) - int(node_timestamp)
        node_min, node_sec = divmod(node_int,60)
        node_hrs, node_min = divmod(node_min,60)
        node_day, node_hrs = divmod(node_hrs,24)

        if node_int > 900:
            node_state = 'down'
            node_tsmsg = "Node Inactive for %d days %02d:%02d:%02d" % (node_day, node_hrs, node_min, node_sec)
        else:
            node_tsmsg = ""

        if verbose:
            print "Timestamp for %s (%d secs)" % (hostname, node_sec)

    else:
        node_state = 'dead'
        node_tsmsg = "No timestamp registered for this node"

        if verbose:
            print "No timestamp for %s" % hostname


    for slot in xrange(1, ncpu+1):
        panda_id = panda_user = panda_type = None
        wsecs = csecs = 0
        dot_type = ''
        link = None
        no_job_in_slot = True
        state = "";
        numblocks = 1

        if 'down' in node_state:
            color = red
            bg_color = black
            state = node_state
            msg = node_msg
        elif 'dead' in node_state:
            color = purple
            bg_color = black
            state = node_state
            msg = node_msg
        elif 'offline' in manual_state:
            color = black
            bg_color = pink
            state = manual_state
            msg = manual_msg
        elif 'offline' in node_state:
            color = black
            bg_color = red
            state = node_state
            msg = node_msg
        elif 'midline' in node_state:
            color = black
            bg_color = yellow
            state = node_state
            msg = node_msg
        elif 'midline' in manual_state:
            color = black
            bg_color = yellow
            state = manual_state
            msg = manual_msg
        else:
            color = black
            bg_color = grey
            state = manual_state
            msg = manual_msg

        text = []
        slotname = "%s/%s" % (hostname, slot)
        job = slot_info.get("%s.%d" % (hostname, slot))
        if job:
            wsecs, csecs = job_times.get("%s.times"%job, (0,0))
            prev_wsecs, prev_csecs = job_prev_times.get("%s.prev_times"%job, (0,0))
            numblocks = job_cpus.get("%s.cpus" % job, 1) 
            rss, vm = job_mem.get("%s.mem"%job, ('0','0'))
            walltime = cputime = "???" # display string
            
            panda_id = job_panda.get("%s.panda_id"%job)
            if panda_id:
                panda_user, panda_type = panda_info.get("%s.info"%panda_id, (None, None))

            dot_type = job_types.get('%s.type' % job)
                        
            if wsecs and prev_wsecs:
                wsecs -= prev_wsecs
            if csecs and prev_csecs:
                csecs -= prev_csecs
 
            if wsecs < 0:
                wsecs=0.01
            if csecs < 0:
                csecs=0

            link = 'job_info/%s.html' % job

            if state not in ('free', 'job-exclusive'):
                text.append(state)
            if vm and rss:
                text += ['rss %s vm %s' %(rss, vm)]
            if prev_wsecs:
                walltime = "%s (-%s)" % (HMS(wsecs), HMS(prev_wsecs))
            else:
                walltime = HMS(wsecs)
            if prev_csecs:
                cputime = "%s (-%s)" % (HMS(csecs), HMS(prev_csecs))
            else:
                cputime = HMS(csecs)
            text += ['wall time %s'%walltime, 'cpu time %s'%cputime]
            if wsecs == 0:
                wsecs = 1
            effcy = 100.0 * csecs / wsecs
            if walltime != '???' and cputime != '???':
                text.append('cpu efficiency  %.1f%%' %effcy)

            color = rgb(wsecs, csecs)

            if 'down' in node_state:
                bg_color = red
            elif 'dead' in node_state:
                bg_color = purple
            elif 'offline' in manual_state:
                bg_color = pink
            elif 'offline' in node_state:
                bg_color = red
            elif 'midline' in node_state:
                bg_color = yellow
            elif 'midline' in manual_state:
                bg_color = yellow
            else:
                bg_color = black
            
        else:
            wsecs = csecs = 0
            link = 'job_info/UNAVAILABLE'
            text.append(state)

        if verbose:
            print 'host=', hostname, 'slot=', slot, 'job=', job, dot_type, wsecs, csecs, color

        if load is not None:
            try:
                load = float(load)
                text.insert(0, 'load %.02g' % load)
            except ValueError:
                text.insert(0, 'load %s' % load)

        if panda_id:
            text.insert(0, "<b>panda id: %s</b>" % panda_id)

        if panda_type:
            text.insert(0, "<b>type: %s</b>" % panda_type)

        if panda_user:
            no_job_in_slot = False
            text.insert(0, "<b>user: %s</b>" % panda_user)
        elif job:
            user = job_users.get('%s.user'%job, None)
            if user:
                no_job_in_slot = False
                if user.endswith("@osg-gk.mwt2.org"):
                    user = user.split('@')[0]
                text.insert(0, "<b>user: %s</b>" % user)
            else:
                no_job_in_slot = True
        else:
            no_job_in_slot = True


        if no_job_in_slot:
            dot_type = ''
            link = 'job_info/UNAVAILABLE'

            if 'down' in node_state:
                color = red
                bg_color = black
            elif 'dead' in node_state:
                color = purple
                bg_color = black
            elif 'offline' in manual_state:
                color = pink
                bg_color = black
            elif 'offline' in node_state:
                color = red
                bg_color = black
            elif 'midline' in node_state:
                color = yellow
                bg_color = black
            elif 'midline' in manual_state:
                color = yellow
                bg_color = black
            else:
                color = black
                bg_color = grey



        if node_msg:
            text.append("Node msg: " + node_msg)

        if manual_msg:
            text.append("Admin msg: " + manual_msg)

#        if msg:
#            text.append("Note: " + msg)

        if node_tsmsg:
            text.append(node_tsmsg)

        text.append("Updated by %s on %s" % (updated_user, updated_time))

        for _ in xrange(numblocks):
            data.append((slotname, state, color, dot_type, text, link, bg_color))


timer.end()

# Generate json with the system information
timer = Timer("Generate JSON")
try:
    if verbose: print "Making json file..."
    jsonfile = open(JSON_PATH, "w")
    dataDict = { "time": time.ctime(), "nodes": []}
    for i, nodeData in enumerate(data):
            if verbose: print i, nodeData
            name, state, (r,g,b), dot_type, text, link, (br, bg, bb) = nodeData
            dataDict["nodes"].append({"name": name, "state": state, "color": {"r": r, "g": g, "b": b}, "background_color": {"r": br, "g": bg, "b": bb}, "dot_type": dot_type, "text": text, "link": link})
    json.dump(dataDict, jsonfile)
    jsonfile.close()
    if verbose: print "done"
except Exception, e:
    if verbose: print "Error making json file: ", e
timer.end()

main_timer.end()


