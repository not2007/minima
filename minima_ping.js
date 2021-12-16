const http = require("http");
const fs = require("fs");
const { monitorEventLoopDelay } = require("perf_hooks");

const blanks = "                                                                     ";
function checkString(str, length) {
    if (typeof str === 'number') {
        str = str + '';
    }
    if (str.length < length) {
        return str + blanks.substring(0, length - str.length);
    }
    return str;
}

function toLocalString (time, timezone) {
    timezone = timezone ? timezone : 8;
    time = time ? time : Date.now();
    return new Date(time + timezone * 3600 * 1000).toISOString().replace('T', ' ').replace('Z', '').substring(0, 19);
};

function toJSON (obj, encoding = 'utf8') {
    try {
        if (obj instanceof Buffer) {
            const str = obj.toString(encoding);
            return JSON.parse(str);
        } else  if (typeof obj === 'string') {
            return JSON.parse(obj);
        }
    } catch (err) {
        console.error(err);
    }
}

function getHTTP(uri, callback) {
      const req = http.get(uri, function(res){
        var datas = [];  
	    var size = 0;  
	    res.on('data', function (data) {  
	        datas.push(data);  
	        size += data.length;  
	    });  
	    res.on("end", function () {  
            callback(null, toJSON(Buffer.concat(datas, size)));
	    });  
    }).on("error", function (err) {  
	    callback(err.stack, null);
	}); 
    req.end();
}

function getStatus (node, callback) {
    const now = Date.now();
    if (node.nodePing && node.nodePing.getTime() > now - 10 * 60 * 1000) {
        return callback(null, node);
    }
    const uri = "http://" + node.ip + "/status";
    getHTTP(uri, function(err, res){
        if (err) {
            console.error(err);
            callback(err, node);
        } else {
            if (res.command === "status") {
                node.nodePing = new Date();
                node.nodeStatus = res.status ? 1 : 0             
            }
            //console.log(res);
            callback(null, node);
        }
    });
}

function incentivecash (node, callback) {
    const now = Date.now();
    if (node.lastPing && node.lastPing.getTime() > now - 10 * 60 * 1000) {
        return callback(null, node);
    }
    const uri = "http://" + node.ip + "/incentivecash+uid:" + node.id;
    getHTTP(uri, function(err, res){
        if (err) {
            callback(err, node);
        } else {
            //console.log(res);
            if (res.command === "incentivecash") {
                let response = res.response;
                if (response && response.uid) {
                    let rewards = response.details.rewards;
                    let lastPing = response.details.lastPing ? new Date(response.details.lastPing) : node.lastPing;
                    node.lastPing = lastPing;
                    node.previousRewards = rewards.previousRewards;
                    node.dailyRewards = rewards.dailyRewards;
                    node.communityRewards = rewards.communityRewards;
                    node.status = res.status ? 1 : 0;
                }
            }
            callback(null, node);
        }
    });
}


function scanNodes(nodes, index, callback) {
    if (!nodes) {
        return callback(nodes);
    }
    if (index >= nodes.length) {
        return callback(nodes);
    }
    let node = nodes[index];
    getStatus(node, function(err, node) {
        incentivecash(node, function(err, node){
            scanNodes(nodes, index + 1, callback);
        });
    });
}


function readNodes (filePath, callback) {
    fs.readFile(filePath, function(err, data){
        if (err) {
            callback(err);
        } else {
            const content = data.toString("utf8");
            const arr = content.split("\n");
            const nodes = [];
            //console.log(content);
            arr.forEach(function(line){
                const items = line.split(",");
                const node = {
                    'index' : nodes.length + 1,
                    'email' : items[0],
                    'id' : items[1],
                    'ip' : items[2],
                    'name' : items[3]
                };
                nodes.push(node);
            });
            callback(null, nodes);
        }
    });
}

function writeNodes(filePath, nodes, callback) {

    const result = {
        previousRewards :0,
        dailyRewards :0,
        communityRewards:0,
        count :nodes.length,
        onlineCount :0
    };
    const arr = [];
    nodes.forEach( function(node) {
        let name = checkString(node.name ? node.name : "未知", 10);
        let email = checkString(node.email ? node.email : "未知", 25);
        let nodeid = node.id;
        let ip = checkString(node.ip ? node.ip : "未知");
        let previousRewards = node.previousRewards ? node.previousRewards : 0;
        let dailyRewards = node.dailyRewards ? node.dailyRewards : 0;
        let communityRewards = node.communityRewards ? node.communityRewards : 0;
        let lastPing = node.lastPing ? toLocalString(node.lastPing.getTime()) : "未知'";
        let lastActive = node.nodePing ? toLocalString(node.nodePing.getTime()) : "未知'";
        let on = node.nodeStatus ? "在线" : "掉线";
        let str = node.index + ", 邮箱: " + email  + ", " + nodeid +  ", IP: " + ip + ", 机器: " + name;
        str +=  ", 活跃: " + lastActive + ", PING: " + lastPing; + ", " + on;
        str +=  ", 前奖励: " + previousRewards + ", 日奖励: " + dailyRewards + ", 社区奖励: " + communityRewards;
        if (node.index < 10) {
            str = "  " + str;
        } else if (node.index < 100) {
            str = " " + str;
        }
        arr.push(str);
        if (node.nodeStatus && node.status) {
            result.onlineCount++;
        }
        if (node.previousRewards) {
            result.previousRewards += node.previousRewards;
        }
        if (node.dailyRewards) {
            result.dailyRewards += node.dailyRewards;
        }
        if (node.communityRewards) {
            result.communityRewards += node.communityRewards;
        }
    });
    let res = toLocalString(Date.now());
    res = res + "\t" + "总节点: " + result.count + ",  在线节点: " + result.onlineCount + ",  前奖励: " + result.previousRewards + ",  日奖励: " + result.dailyRewards + ", 社区奖励: " + result.communityRewards;
    res = res + "\n\n" + arr.join("\n");
    console.log(res);
    fs.writeFile(filePath, res, function(err, data){
        if (err) {
            console.error(err);
        };
        callback(err, data);
    });
}


function main () {

    let inputFile;
    let outFile;
    let args = process.argv.splice(2) || [];
    if (args.length > 1) {
        outFile = args[1]
    }
    if (args.length > 0) {
        inputFile = args[0];
    }
    readNodes(inputFile, function(err, nodes){
        if (err) {
            console.error(err);
            process.exit();
        } else {
            scanNodes(nodes, 0, function(nodes){
                writeNodes(outFile, nodes, function(err, res){
                    process.exit();
                });
            });
        }
    });
}

main();