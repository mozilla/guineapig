function issuebadge() {
  console.log("SESSIONS", navigator.id.sessions);
  var assertions = ["http://guineapig.vcap.mozillalabs.com/api/get_assertion/" + encodeURIComponent(navigator.id.sessions[0].email)];
  OpenBadges.issue(assertions, function (errors, successes) {
    console.log("ERRORS", errors);
    console.log("SUCCESSES", successes);
    alert('got the badge!')});
}


function setSessions(val) {
  if (navigator.id) {
    navigator.id.sessions = val ? val : [ ];
  }
};

function browserIdCheck() {
  $.get('/api/whoami', function (res) {
    if (res.email === null) loggedOut();
    else loggedIn(res, true);
  }, 'json');
};

function loggedOut() {
  $("#loginInfo").show();
  $("#new").hide();
  var unlogged = $(".unlogged").show();
  var loggedin = $(".loggedin").hide();
  $("#picture").empty();
  var l = $("#loginInfo .login").removeClass('clickable');
  l.html('<img id="signinButton" src="images/sign_in_blue.png" alt="Sign in">')
    .show().click(function() {
      $("#loginInfo .login").css('opacity', '0.5');
      navigator.id.getVerifiedEmail(gotVerifiedEmail);
    }).addClass("clickable").css('opacity','1.0');
};

// when the user is found to be logged in we'll update the UI, fetch and
// display the user's favorite beer from the server, and set up handlers to
// wait for user input (specifying their favorite beer).
function loggedIn(res, immediate) {
  console.log("RES", res);
  var email = res.email;
  setSessions([ { email: email } ]);

  var unlogged = $(".unlogged").hide();
  var loggedin = $(".loggedin").show();
  $("#new").show();
  // set the user visible display
  var l = $("#you").removeClass('clickable');;
  l.empty();
  l.css('opacity', '1');
  console.log("email: ", email);
  l.append($("<span>").text(email).addClass("username"))
  l.append($('<a id="logout" href="#" >(logout)</a>'));
  l.unbind('click');

  $("#logout").bind('click', logout);

  if (immediate) {
    $("#content .intro").hide();
    $("#content .business").fadeIn(300);
  }
  else {
    $("#content .intro").fadeOut(700, function() {
      $("#content .business").fadeIn(300);
    });
  }

  // get a gravatar cause it's pretty
  var iurl = 'http://www.gravatar.com/avatar/' +
    Crypto.MD5($.trim(email).toLowerCase()) +
    "?s=16";
  $("<img>").attr('src', iurl).appendTo($("#picture"));

  tellbrowser({email: email, avatar: iurl});
}


function tellbrowser(data) {
  try {
    var customEvent = document.createEvent('Event');
    customEvent.initEvent('loggedinEvent', true, true);
  } catch (e) {
    console.log(e);
  }
}


// when the user clicks logout, we'll make a call to the server to clear
// our current session.
function logout(event) {
  event.preventDefault();
  $.ajax({
    type: 'POST',
    url: '/api/logout',
    success: function() {
      // and then redraw the UI.
      loggedOut();
    }
  });
}

// a handler that is passed an assertion after the user logs in via the
// browserid dialog
function gotVerifiedEmail(assertion) {
  // got an assertion, now send it up to the server for verification
  if (assertion !== null) {
    $.ajax({
      type: 'POST',
      url: '/api/login',
      data: { assertion: assertion },
      success: function(res, status, xhr) {
        if (res === null) loggedOut();
        else loggedIn(res);
      },
      error: function(res, status, xhr) {
        alert("login failure" + res);
      }
    });
  }
  else {
    loggedOut();
  }
}

// For some reason, login/logout do not respond when bound using jQuery
if (document.addEventListener) {
  document.addEventListener("login", function(event) {
    $("header .login").css('opacity', '0.5');
    navigator.id.getVerifiedEmail(gotVerifiedEmail);
  }, false);

  document.addEventListener("logout", logout, false);
}


// at startup let's check to see whether we're authenticated
//(have existing cookie), and update the UI accordingly
$(function() {
  try {
    browserIdCheck();
  } catch (e) {
    console.log(e);
  }
});
