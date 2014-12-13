// BASE SETUP
// file system module is built into nodeJs
// Create an express application
var express = require('express');
var app = express();


// middleware
var crypto = require('crypto');
var http = require( 'http' );
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');


// configure app to use the packages we pulled in using npm
// view engine setup
app.set( 'ip', process.env.OPENSHIFT_NODEJS_IP || '127.0.0.1' );
app.set( 'port', process.env.OPENSHIFT_NODEJS_PORT || 8080 );
// The view directory path,
app.set('views', path.join(__dirname, 'views'));
// The default engine extension to use when omitted
app.set('view engine', 'ejs');
app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
    extended: true
}));
app.use("/images", express.static(__dirname + '/images'));

// =====================================================================

var DB = require('mongodb').Db,
    DB_Connection = require('mongodb').Connection,
    DB_Server = require('mongodb').Server,
    async = require('async');

var db_host = "ds063180.mongolab.com";
var db_port = "63180";
var db_user = "gyoho";
var db_pwd = "extracredit";
var db_name = "gumball";


var db = new DB(db_name, new DB_Server(db_host, db_port, {auto_reconnect: true, poolSize: 20}),{w: 1});

var db_init = function (callback) {
    async.waterfall([
    // 1. open database
    function (cb) {
        console.log("INIT: open MongoDB...");
        db.open(cb);
    },
    // 2. authentication
    function (result, cb) {
        console.log("INIT: authentication...");
        db.authenticate(db_user, db_pwd, function(err, res) {
            if(!err) {
                console.log("autenticated!");
                cb(null, callback);
            }
            else {
                console.log("cannot autenticated!");
                console.log(err);
                process.exit(-1);
            }
        });
    },
    // 3. fetch collections
    function (result, cb) {
        console.log("INIT: fetch collections...");
        db.collections(cb);
    },
    ], callback);
};

db_init();

// =====================================================================

var secretKey = "kBl9NwBx3rzlEXaKFSFC843tISru824E";

var get_hash = function(state, timestamp) {
    text = state + "|" + timestamp + "|" + secretKey;
    hmac = crypto.createHmac("sha256", secretKey);
    hmac.setEncoding('base64');
    hmac.write(text);
    hmac.end();
    hash = hmac.read();
    console.log("Hash: " + hash);
    return hash;
}

// =====================================================================

var page = function(req, res, state, timestamp) {
    db.collection('gumball', function(err, collection) {
        collection.find({modelNumber: "7", serialNumber: "123abc"}).toArray(function(err, results) {
            if (err) return err;
            var data = results[0];
            var rec_id = data._id;
            console.log("fetched id: " + rec_id);
            var result = new Object();
            hash = get_hash(state, timestamp);
            console.log(state);
            console.log(data);

            var modelNumber = data.modelNumber;
            var serialNumber = data.serialNumber;
            var count = data.countGumballs;
            console.log("count = " + count);

            result.timestamp = timestamp;
            result.hash = hash;
            result.state = state;

            res.render( 'index', {
                modelNumber : modelNumber,
                serialNumber : serialNumber,
                state : result.state,
                timestamp: result.timestamp,
                hash: result.hash
            });
        });
    });
}



var order = function(req, res, state, timestamp) {
    db.collection('gumball', function(err, collection) {
        collection.find({modelNumber: "7", serialNumber: "123abc"}).toArray(function(err, results) {
            if (err) return err;
            var data = results[0];
            var rec_id = data._id;
            console.log("updating id: " + rec_id);

            var count = data.countGumballs;
            if(count > 0) {
                count--;
                collection.update({_id: rec_id}, {$set: {countGumballs: count}}, function(err, results) {
                    page(req, res, state, timestamp);
                });
            }
            else {
                error(req, res, "*** Out of Inventory ***", timestamp);
            }
        });
    });
}


var handle_get = function (req, res) {
    console.log("GET called...");
    timestamp = new Date().getTime();
    page(req, res, "no-coin", timestamp);
}


var handle_post = function(req, res) {
    console.log("\nPost:");
    console.log("Action: " + req.body.event);
    console.log("State: " + req.body.state);

    var action = "" + req.body.event;
    var state = "" + req.body.state;
    var hashNew = "" + req.body.hash;
    var timestamp = parseInt(req.body.timestamp);
    var currentTime = new Date().getTime();
    var lag = ((currentTime - timestamp)/1000);
    var hashOrig = get_hash(state, timestamp);
    console.log("Time lag: " + lag);
    console.log("Hash now: " + hashNew);
    console.log("Hash original: " + hashOrig);

    if(lag > 120 || hashNew != hashOrig) {
        error(req, res, "*** Session Invalid ***", timestamp);
    }
    else if(action == "Insert Quarter") {
        console.log("A quarter inserted");
        if(state == "no-coin") {
            page(req, res, "has-coin", timestamp);
            console.log("Turn crank and get a gumball");
        }
        else {
            console.log("You already inserted a quarter");
            page(req, res, state, timestamp);
        }
    }
    else if(action == "Turn Crank") {
        if(state == "has-coin") {
            hash = get_hash("no-coin", timestamp);
            order(req, res, "no-coin", timestamp);
            console.log("A gumball is rolling out");
        }
        else {
            page(req, res, state, timestamp);
            console.log("You need to insert a quarter first");
        }
    }
}


app.get("*", handle_get);
app.post("*", handle_post);


// REGISTER OUR ROUTES -------------------------------
// all of our routes will be prefixed with /api



// START THE SERVER
var ip = process.env.OPENSHIFT_NODEJS_IP || '127.0.0.1';
var port = process.env.OPENSHIFT_NODEJS_PORT || 8080;
app.listen(port, ip);
console.log('Server running at http://'+ip+':'+port+'/');
