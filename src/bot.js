five = require("johnny-five");
ik = require("./ik");
board = new five.Board({
  debug: false
});
require("sylvester");

var app = require('http').createServer(handler),
  io = require('socket.io').listen(app, {
    log: false
  }),
  fs = require('fs')

  board.on("ready", function() {
    var servo1 = five.Servo({
      pin: 10
    });
    var servo2 = five.Servo({
      pin: 11
    });
    var servo3 = five.Servo({
      pin: 12
    });

    setTimeout(function() {}, 500);

    board.repl.inject({
      servo1: servo1,
      s1: servo1,
      servo2: servo2,
      s2: servo2,
      servo3: servo3,
      s3: servo3
    });

    var max = 37;
    var min = 15;
    var range = max - min;
    servo1.move(min);
    servo2.move(min);
    servo3.move(min);

    var dance = function() {
      servo1.move(parseInt((Math.random() * range) + min, 10));
      servo2.move(parseInt((Math.random() * range) + min, 10));
      servo3.move(parseInt((Math.random() * range) + min, 10));
    };

    var dancer;

    start_dance = function() {
      if (!dancer) dancer = setInterval(dance, 100);
    }

    stop_dance = function() {
      if (dancer) {
        clearInterval(dancer);
        dancer = null;
      }
    }

    board.repl.inject({
      dance: start_dance,
      chill: stop_dance
    });

    servo1.on("error", function() {
      console.log(arguments);
    })
    servo2.on("error", function() {
      console.log(arguments);
    })
    servo3.on("error", function() {
      console.log(arguments);
    })
  });

go = function(x, y, z) {
  angles = ik.inverse(x, y, z);
  console.log("Moving to [" + x + ", " + y + ", " + z + "]");
  // console.log("[" + angles[1] + ", " + angles[2] + ", " + angles[3] + "]");

  s1.move(angles[1]);
  s2.move(angles[2]);
  s3.move(angles[3]);
}

position = function() {
  // console.log( "Servo 1 Last: " + servo1.last.degrees );
  // console.log( "Servo 2 Last: " + servo2.last.degrees );
  // console.log( "Servo 3 Last: " + servo3.last.degrees );
  return ik.forward(servo1.last.degrees, servo2.last.degrees, servo3.last.degrees);
}

reload = function() {
  console.log("Reloading...");
  io.sockets.emit('reload');
  console.log("...done");
}

app.listen(8011);

myIo = io;

function handler(req, res) {
  var file = "/client.html",
    type = "text/html";

  if (req.url == "/control") {
    file = "/control.html";
  }
  if (req.url == "/tweetscreen.png") {
    file = "/tweetscreen.png";
    type = "image/png";
  }

  fs.readFile(__dirname + file,

  function(err, data) {
    if (err) {
      res.writeHead(500);
      return res.end('Error loading ' + file);
    }

    res.writeHead(200, {
      'Content-Type': type
    });
    res.end(data);
  });
}

io.sockets.on('connection', function(socket) {
  clientSocket = socket;
  socket.emit('news', {
    hello: 'world'
  });
  socket.on('device info', function(data) {
    console.log("DEVICE:", data);
  });

  socket.on('tap', function(position) {
    console.log("TAP:", position);
    tapped = position;
  });

  socket.on('down', function(position) {
    console.log("Down event", position);
    deviceGo(position.x, position.y, 0);
    setTimeout(function() {
      moveZ(downZ);
    }, 100);
  });

  socket.on('up', function() {
    moveZ(safeZ);
  });
});

isCalibrating = false;

botPlane = [];
devicePlane = [];
safeZ = 0;
downZ = 0;

moveZ = function(zVal) {
  go(position()[1], position()[2], zVal);
}

deviceGo = function(x, y, touch) {
  console.log("Got a click! [x: ", x, ", y: ", y, "]");
  // translate from device coordinates to bot coordinates
  var a = translationMatrix.elements[0][0],
    b = translationMatrix.elements[1][0],
    c = translationMatrix.elements[2][0],
    d = translationMatrix.elements[3][0];

  yprime = a * x + b * y + c;
  xprime = b * x - a * y + d;
  go(xprime, yprime, (touch ? downZ : safeZ));
}

translationMatrix = $M([0]);

calculateTranslation = function() {
  var b0x = botPlane[0].x,
    b0y = botPlane[0].y,
    b1x = botPlane[1].x,
    b1y = botPlane[1].y;
  var d0x = devicePlane[0].x,
    d0y = devicePlane[0].y,
    d1x = devicePlane[1].x,
    d1y = devicePlane[1].y;

  var M = $M([
    [d0x, d0y, 1, 0],
    [-d0y, d0x, 0, 1],
    [d1x, d1y, 1, 0],
    [-d1y, d1x, 0, 1]
  ]);
  var u = $M([
    [b0x],
    [b0y],
    [b1x],
    [b1y]
  ]);
  var MI = M.inverse();
  translationMatrix = MI.multiply(u);
}

calibrate = function() {
  var isCalibrating = true,
    x = position()[1],
    y = position()[2],
    z = position()[3],
    iter = 0

    safeZ = z;

  function doIt() {
    go(x, y, safeZ);
    moveDownUntilTap(function(err) {}, function(tap) {
      // console.log("Tapped!");
      botPlane.push({
        x: position()[1],
        y: position()[2],
        z: position()[3]
      });
      downZ = position()[3];
      devicePlane.push(tap);
      moveZ(safeZ);
      iter += 1;
      if (iter <= 2) {
        if (iter == 1) {
          x += 20;
          y += 20;
          console.log("Finding first point, going to [x: ", x, ", y: ", y, "]")
        }
        if (iter == 2) {
          x -= 30;
          y -= 35;
          console.log("Finding second point, going to [x: ", x, ", y: ", y, "]")
        }
        doIt();
        if (iter == 2) {
          calculateTranslation();
          console.log("Calibration complete. Here's the matrix:\n", translationMatrix);
        }
      }
    });
  }

  doIt();
}

tapped = false;
moveDownUntilTap = function(err, callback) {
  x = position()[1];
  y = position()[2];
  z = position()[3];
  z -= 1;
  go(x, y, z); // it's moving now
  setTimeout(function() {
    if (tapped) {
      console.log("Tapped!");
      callback(tapped);
      tapped = false;
    } else {
      console.log("No tap: moving down more");
      moveDownUntilTap(err, callback);
    }
  }, 500);
}
