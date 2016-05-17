//this will set the database environemnt in the config.json file

var express = require('express');
var session = require('express-session');
var path = require('path');
var logger = require('morgan');
var mysql = require('mysql');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var https = require('https');
var fs = require('fs');

var app = express();

var environment = process.env.ENVIRONMENT || 'qas';
var port = process.env.PORT || 80;
var ssl_port = process.env.SSL_PORT || 443;
var enable_redirect = process.env.ENABLE_REDIRECT || true;

app.use(bodyParser.urlencoded({extended:true}));
app.use(bodyParser.json());
app.use(cookieParser());

//for creating the session availability
app.use(
    session({
        secret: 'H3LbN0M_LM',
        resave: false,
        saveUninitialized: false,
        cookie: { maxAge: 600000 }  //max cookie age is 60 minutes
    })
);

// Setup for authentication (must be after all body parsers, cookie parsers and session parsers)
//var auth = require('./auth');
//auth.setupAuthentication(environment, port, ssl_port, app);

var socialMedia = require('./modules/socialmedia');
var schedule = require('node-schedule');

var rule = new schedule.RecurrenceRule();
rule.minute = 29;

var twitterSearch = schedule.scheduleJob(rule, function() {
    socialMedia.setupTwitter();
    socialMedia.getSocialMediaKeywords();
});

//socialMedia.searchTwitter('#HelpNow');

//set the express.static locations to serve up the static files
app.use(express.static('lib'));
app.use('/', express.static( __dirname + '/'));



app.get('/', function (req, res) {
    if (req.protocol == "http" && enable_redirect == "true") {
        res.redirect('https://' + req.hostname + ":" + ssl_port + req.url);
    } else {
        res.sendFile(__dirname + '/app.html');
    }
});

app.listen(port, function(){
    console.log('Running on PORT:' + port);
});

https.createServer({
    key: fs.readFileSync('./certs/key.pem'),
    cert: fs.readFileSync('./certs/cert.pem')
}, app).listen(ssl_port, function() {
    console.log('Running on PORT:' + ssl_port);
});
