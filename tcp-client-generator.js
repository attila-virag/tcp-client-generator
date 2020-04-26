
var net = require('net');
var fs = require('fs');
const options = require('./config.json')

// get required options
var logFileName = options.logFile;
var HOST = options.address;
var PORT = options.port;
var requestRate = options.requestRate;
var requestTimeout = options.requestTimeout;
var requestCycles = options.requestCycles;
var replyExpected = options.waitForReply;
var totalClients = options.totalClients;

// optional
var requestStr = options.requestStr;
var replyStrContains = options.replyStrContains;
if(replyExpected) {
  var replyStrContains = options.replyStrContains;
}

var logger = fs.createWriteStream(logFileName+"_"+new Date().getTime().toString()+".txt", { 
  flags: 'a' 
})
logger.write('\n ================= Start Log: '+ new Date().toString()  + ' ================= \n');

var requestCycleCount = 0;
var requestID = 0;
var responseID = 0;
var outStr = '<<<';
var inStr = '>>>';

var percentComplete = 0;
//var consoleMsg = ""

var clientConnections = new Array();

class ClientConn  {

  constructor(clientId) {
    this.clientId = clientId;
    this.client = new net.Socket();
    this.clientConnected = false;
    this.waitingForReply = false;
    this.lastPolltime = 0;
    this.data = new Array();
  }

  connectFunc(PORT, HOST){
    this.client.connect(PORT, HOST, function(){
      logger.write(new Date().getTime().toString()  + '\nCLIENT '+ this.clientId +' CONNECTED TO: ' + HOST + ':' + PORT + '\n');
      this.clientConnected = true;
    }.bind(this));

    this.client.on('data', function(chunk) {
      this.data.push(chunk)
    }.bind(this));

    this.client.on('end', function() {
      responseID++;
      var replyStr = Buffer.concat(this.data).toString();
      var time = new Date().getTime();
      var responseTime = time-this.lastPolltime;
      var timeoutMsg = '';
      if(responseTime > requestTimeout*1000) {
        timeoutMsg = " -- RESPONSE TIMEOUT!! -- "
      }
      var correctReplyMsg = " -- UNEXPECTED REPLY -- ";
      var n = replyStr.search(replyStrContains);
      if(n > 0) {
        correctReplyMsg = " -- GOOD REPLY -- ";
      }
      
      logger.write(inStr + time.toString() + ': CLIENT '+this.clientId+ + ' RESPONSE ID: '+ responseID + correctReplyMsg + timeoutMsg+' [ Response time (ms): '+ (responseTime).toString() + ' ] Response DATA: \n' + replyStr+ '\n');
      this.waitingForReply = false;
      this.data = [];
    }.bind(this));
    // // Add a 'close' event handler for the client socket
    this.client.on('close', function() {
      logger.write(new Date().getTime().toString()  + ' CLIENT '+ this.clientId +' Connection closed\n');
      this.clientConnected = false;
    }.bind(this));
  }

  PollFunc() {
    // enter actual message
    var buff = Buffer.from(requestStr, 'utf8'); 
    this.client.write(buff);
    requestID++;
    if(true === replyExpected) {
      this.waitingForReply = true;
    }
    this.lastPolltime = new Date().getTime();
    logger.write(outStr +  ': CLIENT '+this.clientId +' Message Id: '+ requestID + ' Time: '+ this.lastPolltime.toString()  + ' Sending : \n' + requestStr+ '\n');
  }

  closeSocket() {
    this.client.destroy();
  }

}

// initiate all the client connections
for (var i = 0; i < totalClients; i++) {
  var client = new ClientConn(i);
  client.connectFunc(PORT, HOST);
  clientConnections.push(client);
}

function PollingFunc() {
  requestCycleCount++;
  percentComplete = 100*(requestCycleCount/requestCycles);
  var logString = "Test progress: "+ percentComplete + "%";
  console.log(logString);

  for (i = 0; i < totalClients; i++) {
    var client = clientConnections[i];
    if(client.clientConnected && !client.waitingForReply){
      client.PollFunc();
    }
    if(!client.clientConnected) {
      client.connectFunc(PORT, HOST);
    }
    if(requestCycleCount == requestCycles) {
      // close the connection
      client.closeSocket();
    }
  }
  if(requestCycleCount == requestCycles) {
    clearInterval(this);
  }
}
// register our pollingFunction to be called at requestRate interval
setInterval(() => PollingFunc(), requestRate*1000);
