
/**
 * Module dependencies.
 */

const express = require('express'),
sessions = require('connect-cookie-session'),
path = require('path'),
cluster = require('cluster'),
postprocess = require('postprocess'),
https = require('https'),
querystring = require('querystring'),
url = require('url'),
redis = require("redis");



if (process.env.VCAP_SERVICES) {
  console.log("VCAP_SERVICES=", process.env.VCAP_SERVICES);
  redisConfig = JSON.parse(process.env.VCAP_SERVICES)['redis-2.2'][0].credentials;
  redis_host = redisConfig.host;
  redis_port = redisConfig.port;
  db = redis.createClient(redis_port, redis_host);
  db.auth(redisConfig.password);
} else {
  db = redis.createClient();
}

var RedisStore = require('connect-redis')(express);

var app = module.exports = express.createServer();

// Configuration

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function(){
  app.use(express.errorHandler()); 
});

// Routes

// the key with which session cookies are encrypted
const COOKIE_SECRET = process.env.SEKRET || 'must be careful dude';

// The IP Address to listen on.
const IP_ADDRESS = process.env.VCAP_APP_HOST || '127.0.0.1';

// The port to listen to.
const PORT = process.env.VCAP_APP_PORT || 8004;

// localHostname is the address to which we bind.  It will be used
// as our external address ('audience' to which assertions will be set)
// if no 'Host' header is present on incoming login requests.
var localHostname = undefined;

// do some logging
app.use(express.logger({ format: 'dev' }));
// parse cookies
app.use(express.cookieParser());
// app.use(express.session({ secret: COOKIE_SECRET, store: new RedisStore }));
// parse post bodies
app.use(express.bodyParser());

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.use(express.compiler({ src: __dirname + '/public'}));
  app.use(express.methodOverride());
  app.use(express.static(__dirname + '/public'));
});


// session support using signed cookies
app.use(function (req, res, next) {
  if (/^\/api/.test(req.url)) {
    return sessions({
      secret: COOKIE_SECRET,
      key: 'sylviatime_session',
      cookie: {
        path: '/api',
        httpOnly: true,
        // when you're logged in, you're logged in for a month
        maxAge: (30 * 24 * 60 * 60 * 1000), 
        secure: false
      }
    })(req, res, next);
  } else {
    return next();
  }
});

function determineEnvironment(req) {
  if (req.headers['host'] === 'guineapig.vcap.mozillalabs.com') return 'prod';
  else return 'local';
}


// /api/whoami is an API that returns the authentication status of the current session.
// it returns a JSON encoded string containing the currently authenticated user's email
// if someone is logged in, otherwise it returns null.
app.get("/api/whoami", function (req, res) {
  console.log("WHOAMI CALLED,", req.session)
  if (req.session && typeof req.session.email === 'string') 
    return res.json({'email': req.session.email});
  return res.json({'email': null});
});


app.get("/api/wholoves/*", function (req, res) {
  var url = req.params[0];
  var email = null;
  if (req.session && typeof req.session.email === 'string') 
    email = req.session.email;
  db.scard(url, function(err, answer) {
    var count = answer;
    db.sismember(email, url, function (err, answer) {
      console.log("does email love it? = ", answer);
      return res.json({'email': email,
                       'you': answer,
                       'loves': count});
    });
  })
});

app.post("/api/loveit/*", function (req, res) {
  if (! req.session.email) {
    console.log("we're not authed"); 
    res.writeHead(500);
    res.end();
  }
  var url = req.params[0];
  var email = req.session.email;
  db.sadd(url, email, function(err, ok) {
    db.sadd(email, url, function(err, ok) {
      return res.json({'status': 'ok'});
    })
  })

})

// /api/login is an API which authenticates the current session.  The client includes 
// an assertion in the post body (returned by browserid's navigator.id.getVerifiedEmail()).
// if the assertion is valid an (encrypted) cookie is set to start the user's session.
// returns a json encoded email if the session is successfully authenticated, otherwise
// null.
app.post("/api/login", function (req, res) {
  // To verify the assertion we initiate a POST request to the browserid verifier service.
  // If we didn't want to rely on this service, it's possible to implement verification
  // in a library and to do it ourselves.  
  var vreq = https.request({
    host: "https://browserid.org",
    path: "/verify",
    method: 'POST'
  }, function(vres) {
    var body = "";
    vres.on('data', function(chunk) { body+=chunk; } )
        .on('end', function() {
          try {
            try {
              var verifierResp = JSON.parse(body);
            } catch (e) {
              console.log("non-JSON response from verifier:" + body.toString());
            }
            var valid = verifierResp && verifierResp.status === "okay";
            var email = valid ? verifierResp.email : null;
            req.session.email = email;
            if (!valid) {
              console.log("failed to verify assertion:", verifierResp.reason);
            }
            res.json({'email':email});
          } catch(e) {
            console.log("SOME OTHER EXCEPTION: ", e);
            // bogus response from verifier!  return null
            res.json({'email':null});
          }
        });
  });
  vreq.setHeader('Content-Type', 'application/x-www-form-urlencoded');

  // An "audience" argument is embedded in the assertion and must match our hostname.
  // Because this one server runs on multiple different domain names we just use
  // the host parameter out of the request.
  var audience = req.headers['host'] ? req.headers['host'] : localHostname;
  var data = querystring.stringify({
    assertion: req.body.assertion,
    audience: audience
  });
  vreq.setHeader('Content-Length', data.length);
  vreq.write(data);
  vreq.end();
});

// /api/logout clears the session cookie, effectively terminating the current session.
app.post("/api/logout", function (req, res) {
  req.session.email = null;
  res.json(true);
});


app.get("/api/get_assertion/*", function (req, res) {
  return res.json({
    "recipient": decodeURIComponent(req.params[0]), // just grant them to EVERYONE!! XXX
    "evidence": "/badges/html5-basic/bimmy",
    "expires": "2013-06-01",
    "issued_on": "2011-06-01",
    "badge": {
      "version": "0.1.0",
      "name": "Guinea Pig",
      "image": "http://guineapig.vcap.mozillalabs.com/images/moz-labs.png",
      "description": "Can be a experimental subject",
      "criteria": "/badges/html5-basic",
      "issuer": {
        "origin": "http://guineapig.vcap.mozillalabs.com",
        "name": "Mozilla Labs",
        "org": "Mozilla",
        "contact": "dascher@mozilla.com"
     }
    }
  });
});


app.listen(PORT, IP_ADDRESS, function () {
    var address = app.address();
    localHostname = address.address + ':' + address.port
    console.log("listening on " + localHostname +" in " + app.settings.env + " mode.");
});
