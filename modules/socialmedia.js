var Twitter = require('twitter');
var http = require('http');
var client;
var keywords;
var lastTweetID;
var lastIDNeedsPost = false;

var helpRequest = { EventID: '1', RequestStateID: '1', Notes: 'Reported from Twitter', AreaSize: '0.25', UnitOfMeasure: 'km', Quantity: '1', RequestUrgencyID: '2', LAT: '0.00', LONG: '0.00', ResourceTypeID: '1' };

var env = process.env.NODE_ENV || 'aws-development';
var config = require(__dirname + '/../config/config.json')[env];

var options = {
    host: config.apiserver,
    path: '/api/resourcerequest',
    port: '80',
    auth: config.apikey,
    method: 'POST',
    headers: {
        "Content-Type": "application/json"
    }
};

var lastIDPostOptions = {
    host: config.apiserver,
    path: '/api/socialmedia/',
    port: '80',
    auth: config.apikey,
    method: 'POST',
    headers: {
        "Content-Type": "application/json"
    }
}

var lastIDUpdateOptions = {
    host: config.apiserver,
    path: '/api/socialmedia/1',
    port: '80',
    auth: config.apikey,
    method: 'PUT',
    headers: {
        "Content-Type": "application/json"
    }
}

var keywordOptions = {
    host: config.apiserver,
    path: '/api/event',
    port: '80',
    auth: config.apikey,
    method: 'GET',
    headers: {
        "Content-Type": "application/json"
    }
};

var socialMediaOptions = {
    host: config.apiserver,
    path: '/api/socialmedia',
    port: '80',
    auth: config.apikey,
    method: 'GET',
    headers: {
        "Content-Type": "application/json"
    }
}

keywordCallback = function (response) {
    var str = '';
    response.on('data', function (chunk) {
        str += chunk;
        //console.log(str);
    });

    response.on('end', function () {

        var jsonObject = JSON.parse(str);
        var events = jsonObject.json;
        var keywordStr = '';
        for (var i = 0; i < events.length; i++) {
            if (events[i].Keywords != null) {
                keywordStr += events[i].Keywords;
                keywords = keywordStr.split(',');
                var queryStr = '';
                for (var j = 0; j < keywords.length; j++) {
                    keywords[j] = keywords[j].trim();
                    if (keywords.length == 1) {
                        queryStr = keywords[j];
                    }
                    else if (keywords.length > 1) {
                        if (j == 0) {
                            queryStr += keywords[j];
                        }
                        else {
                            queryStr += " OR " + keywords[j];
                        }
                    }
                }
                console.log("Query String: " + queryStr);
                //console.log(JSON.stringify(events[i]));
                searchTwitter(queryStr, events[i].EventID, events[i].EventLocations[0].LAT, events[i].EventLocations[0].LONG, events[i].EventLocations[0].Radius);
                keywordStr = '';
            }
        }
        //console.log(keywords);
    });
}

resourceRequestCallback = function (response) {
    var str = '';
    response.on('data', function (chunk) {
        str += chunk;
    });

    response.on('end', function () {
        console.log("Need Request Created: " + str);
    });
}

socialMediaCallback = function (response) {
    var str = '';
    response.on('data', function (chunk) {
        str += chunk;
    });

    response.on('end', function () {
        console.log("Social Media Data: " + str);
        var jsonObject = JSON.parse(str);
        if (jsonObject.json[0] !== undefined && jsonObject.json[0] != null) {
            lastTweetID = jsonObject.json[0].LastRecordedID;
            lastIDNeedsPost = false;
        }
        else {
            lastTweetID = '0';
            lastIDNeedsPost = true;
        }
        console.log("Last Tweet ID: " + lastTweetID);
    });
}

lastIDCallback = function (response) {
    var str = '';
    response.on('data', function (chunk) {
        str += chunk;
    });

    response.on('end', function () {
        console.log(str);
    });
}

module.exports.setupTwitter = function () {
    client = new Twitter({
        consumer_key: config.twitter_consumerkey,
        consumer_secret: config.twitter_consumersecret,
        access_token_key: config.twitter_accesstokenkey,
        access_token_secret: config.twitter_accesstokensecret
    });
};

module.exports.getSocialMediaKeywords = function () {
    getLastTwitterId();
    var req = http.request(keywordOptions, keywordCallback).end();
}

function getLastTwitterId() {
    var req = http.request(socialMediaOptions, socialMediaCallback).end();
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = deg2rad(lat2 - lat1);
    var dLon = deg2rad(lon2 - lon1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c;
    return d;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

function searchTwitter(queryParameter, eventID, eventLAT, eventLONG, eventRadius) {
    var lastID = lastTweetID;
    var socialMediaDistance = eventRadius + (eventRadius * 0.2);
    //console.log("Social Media Distance: " + socialMediaDistance);
    client.get('search/tweets', { q: queryParameter, since_id: lastTweetID }, function (error, tweets, response) {
        if (error) {
            console.log(error);
        }
        else {
            for (i = 0; i < tweets.statuses.length; i++) {
                if (tweets.statuses[i].id_str > lastID)
                    lastID = tweets.statuses[i].id_str;

                helpRequest.LAT = null;
                helpRequest.LONG = null;
                var distanceFromEventCenter = 0;
                if (tweets.statuses[i].place != null) {
                    var boundingBox = tweets.statuses[i].place.bounding_box.coordinates;
                    if (boundingBox != null) {
                        var north = boundingBox[0][3][1];
                        var south = boundingBox[0][0][1];
                        var west = boundingBox[0][0][0];
                        var east = boundingBox[0][2][0];
                        var latitudeDiff = north - south;
                        var longitudeDiff = east - west;
                        helpRequest.LAT = north - (latitudeDiff / 2);
                        helpRequest.LONG = east - (longitudeDiff / 2);
                        //console.log("Lat1: " + helpRequest.LAT);
                        //console.log("Long1: " + helpRequest.LONG);
                        //console.log("Lat2: " + eventLAT);
                        //console.log("Long2: " + eventLONG);
                        distanceFromEventCenter = getDistanceFromLatLonInKm(helpRequest.LAT, helpRequest.LONG, eventLAT, eventLONG);
                       // console.log("Distance From Event: " + distanceFromEventCenter);
                    }
                }

               // console.log(tweets.statuses[i].id + ' ' + tweets.statuses[i].text);
                if ((tweets.statuses[i].text.indexOf("food") > -1 || tweets.statuses[i].text.indexOf("Food") > -1) && helpRequest.LAT != null && helpRequest.LONG != null && distanceFromEventCenter < socialMediaDistance ) {
                    console.log(tweets.statuses[i].text);
                    
                    helpRequest.ResourceTypeID = 2;
                    helpRequest.EventID = eventID;
                    var req = http.request(options, resourceRequestCallback);
                    req.write(JSON.stringify(helpRequest));
                    req.end();
                }
                if ((tweets.statuses[i].text.indexOf("water") > -1 || tweets.statuses[i].text.indexOf("Water") > - 1) && helpRequest.LAT != null && helpRequest.LONG != null && distanceFromEventCenter < socialMediaDistance) {
                    console.log(tweets.statuses[i].text);
                    helpRequest.ResourceTypeID = 1;
                    helpRequest.EventID = eventID;
                    var req = http.request(options, resourceRequestCallback);
                    req.write(JSON.stringify(helpRequest));
                    req.end();
                }
                if ((tweets.statuses[i].text.indexOf("medicine") > -1 || tweets.statuses[i].text.indexOf("Medicine") > -1) && helpRequest.LAT != null && helpRequest.LONG != null && distanceFromEventCenter < socialMediaDistance ) {
                    console.log(tweets.statuses[i].text);
                    helpRequest.ResourceTypeID = 6;
                    helpRequest.EventID = eventID;
                    var req = http.request(options, resourceRequestCallback);
                    req.write(JSON.stringify(helpRequest));
                    req.end();
                }
                if ((tweets.statuses[i].text.indexOf("shelter") > -1 || tweets.statuses[i].text.indexOf("Shelter") > -1) && helpRequest.LAT != null && helpRequest.LONG != null && distanceFromEventCenter < socialMediaDistance ) {
                    console.log(tweets.statuses[i].text);
                    helpRequest.ResourceTypeID = 3;
                    helpRequest.EventID = eventID;
                    var req = http.request(options, resourceRequestCallback);
                    req.write(JSON.stringify(helpRequest));
                    req.end();
                }
                if ((tweets.statuses[i].text.indexOf("medical") > -1 || tweets.statuses[i].text.indexOf("Medical") > -1)  && helpRequest.LAT != null && helpRequest.LONG != null && distanceFromEventCenter < socialMediaDistance ) {
                    console.log(tweets.statuses[i].text);
                    helpRequest.ResourceTypeID = 4;
                    helpRequest.EventID = eventID;
                    var req = http.request(options, resourceRequestCallback);
                    req.write(JSON.stringify(helpRequest));
                    req.end();
                }
                if ((tweets.statuses[i].text.indexOf("clothing") > -1 || tweets.statuses[i].text.indexOf("Clothing") > -1 ) && helpRequest.LAT != null && helpRequest.LONG != null && distanceFromEventCenter < socialMediaDistance ) {
                    console.log(tweets.statuses[i].text);
                    helpRequest.ResourceTypeID = 5;
                    helpRequest.EventID = eventID;
                    var req = http.request(options, resourceRequestCallback);
                    req.write(JSON.stringify(helpRequest));
                    req.end();
                }
                if ((tweets.statuses[i].text.indexOf("rescue") > -1 || tweets.statuses[i].text.indexOf("Rescue") > -1)  && helpRequest.LAT != null && helpRequest.LONG != null && distanceFromEventCenter < socialMediaDistance ) {
                    console.log(tweets.statuses[i].text);
                    helpRequest.ResourceTypeID = 8;
                    helpRequest.EventID = eventID;
                    var req = http.request(options, resourceRequestCallback);
                    req.write(JSON.stringify(helpRequest));
                    req.end();
                }
                if ((tweets.statuses[i].text.indexOf("evacuation") > -1 || tweets.statuses[i].text.indexOf("Evacuation") > -1)  && helpRequest.LAT != null && helpRequest.LONG != null && distanceFromEventCenter < socialMediaDistance ) {
                    console.log(tweets.statuses[i].text);
                    helpRequest.ResourceTypeID = 7;
                    helpRequest.EventID = eventID;
                    var req = http.request(options, resourceRequestCallback);
                    req.write(JSON.stringify(helpRequest));
                    req.end();
                }
            }
            if (lastID > 0) {
                console.log("New Last Tweet ID: " + lastID);
                var socialMediaObject = { LastRecordedID: lastID }
                var req;
                if (lastIDNeedsPost) {
                    req = http.request(lastIDPostOptions, lastIDCallback);
                }
                else {
                    req = http.request(lastIDUpdateOptions, lastIDCallback);
                }
                req.write(JSON.stringify(socialMediaObject));
                req.end();
            }
            //console.log("Query Parameter: " + queryParameter + " Event ID: " + eventID + " Last ID: " + lastID);
        }
    });
};
