const config = require('./config');
const TelegramBot = require('node-telegram-bot-api');
const request = require('request');
const winston = require('winston');
const https = require('https');

const logger = winston.createLogger({
  levels: winston.config.syslog.levels,
  transports: [
    new winston.transports.Console({ level: 'info' }),
    new winston.transports.File({
      filename: 'combined.log',
      level: 'debug'
    })
  ]
});

// replace the value below with the Telegram token you receive from @BotFather
const token = config.botToken;

var chatId = "";

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, {polling: true});

var log = function (message) {
  console.log(message);
  logger.info(message, {timestamp: Date.now(), pid: process.pid});
}

var debugLog = function (message) {
  console.log(message);
  logger.debug(message, {timestamp: Date.now(), pid: process.pid});
}

var splitInput = function (inputText) {
  var splitArr = inputText.split(' ');
  var society="ACZ";
  var flatBlock="";
  if(splitArr.length>=2)
  {
    if(splitArr[1]!="ASZ" || splitArr[1]!="ACZ")
    {
      debugLog("Apartment supported is only ASZ & ACZ. Input given is "+splitArr[1]);
      return null;
    }
    society = splitArr[1];
    flatBlock=splitArr[0];
  }
  else
  {
    flatBlock=inputText;
  }
  var flatBlockSociety=flatBlock.split('-');
  if(flatBlockSociety != null && flatBlockSociety.length == 2) {
    flatBlockSociety[2]=society;
    return flatBlockSociety;
  } else {
    debugLog("Flat number " + inputText + " not sent in the correct format");
    return null;
  }
    
  
}
var splitBlockAndFlatNumber = function (inputText) {
  var splitArr = inputText.split('-');

  if(splitArr != null && splitArr.length == 2) {
    return splitArr;
  } else {
    debugLog("Flat number " + inputText + " not sent in the correct format");
    return null;
  }
}

var postPTINDataBack = function(ptinDataObject) {

  if(!(ptinDataObject instanceof Array && ptinDataObject.length > 5)) {
    debugLog("ERROR: Can't post PTIN Data back as the result is not found or the length is not enough. " + JSON.stringify(ptinDataObject));
    sendMessage("No PTIN found for the input. Please check if a PTIN is generated or not for this flat manually from the GHMC website");

    return;
  }

  debugLog("PTIN correctly queried because total records fetched = 1");

  var stringOutput = "";
  stringOutput += "*** PTIN Results found *** ";
  stringOutput += "\n Name: " + ptinDataObject[2];
  stringOutput += "\n PTIN: " + ptinDataObject[1];
  stringOutput += "\n Flat/House details: " + ptinDataObject[3];
  stringOutput += "\n Circle: " + ptinDataObject[5];
  stringOutput += "\n Area: " + ptinDataObject[4];
  // stringOutput += "\n More Details : " + "https://ptghmconlinepayment.cgg.gov.in/SearchYourProperty.do?method=getDues&i_asmtno=" + ptinDataObject[1]; // append the PTIN number.
  stringOutput += "\n <a href='https://ptghmconlinepayment.cgg.gov.in/SearchYourProperty.do?method=getDues&i_asmtno=" + ptinDataObject[1] + "'>More Details</a>"; // append the PTIN number.
  // TODO: gather more details and display the dues, due dates and total dues.
  sendMessage(stringOutput);
}

var loopAndReturnCorrectPTINObject = function (blockName, flatNumber, dataArray) {

  var searchString1;

  if(blockName == "A&B") {
    var searchString1 = "1-100/ACZ/A&B/"+flatNumber;
    var searchString2 = "1-100/ACZ/A & B/" + flatNumber;
  } else {
    debugLog("WARN: Loop and Return not required for other block Name " + blockName + "blockName" + " but will loop to check");
    var searchString1 = "1-100/ACZ/" + blockName + "/" + flatNumber;
    var searchString2 = null;
  }

  var resultFound = new Array();
  debugLog("Searching for blockName - " + blockName + " and flatNumber " + flatNumber + " in an array of size - " + dataArray.length)
  dataArray.some(function(each, index) {
    var eachAddress = each[3];
    if(eachAddress == searchString1 || eachAddress == searchString2) {
      debugLog("Found the required search result " + JSON.stringify(each));
      resultFound = each;
      return true;
    }
  });

  if(resultFound.length == 0) {
    debugLog("No result found for the input Block Name " + blockName + " and flat number " + flatNumber);
  }

  return resultFound;
}

var retrievePTINData = function (blockName, flatNumber, data) {

  try {

    debugLog("Successfully fetched PTIN - " + JSON.stringify(data));

    var stringOutput = "";

    // if records are found
    if(data.iTotalRecords == 1) {
      debugLog("PTIN correctly queried because total records fetched = 1");
      var firstResult = data.aaData[0];
      postPTINDataBack(firstResult);
    } else if(data.iTotalRecords > 0 && blockName == "A&B") {
      // For AB Block, we get more than 1 result - so need to loop and find the correct record.
      var searchedResult = loopAndReturnCorrectPTINObject(blockName, flatNumber, data.aaData);
      postPTINDataBack(searchedResult);
    } else {
      sendMessage("PTIN doesn't appear to be correctly queried because total records fetched = " + data.iTotalRecords);
    }
  } catch(ex) {
    debugLog("Exception occured while posting the PTIN details back to the chat sender " + ex.message);
  }
}

var queryGHMCWebsite = function (blockName, flatNumber,society) {

  // Make it upper so that its uniform everywhere,
  if(blockName == "AB" || blockName == "ab") {
    blockName = "A&B";
  }

  debugLog("Querying GHMC website for blockName - " + blockName + " Flat number " + flatNumber + "society - " + society);
  var url = "https://ptghmconlinepayment.cgg.gov.in/SearchYourProperty.do?method=getPropertyList&circleNo=1055&ownerName=&doorNo=1-100/"+ society+ "/" + blockName + "/" + flatNumber + "&ptinno=&sEcho=1&iColumns=7&sColumns=%2C%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=25&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true&mDataProp_1=1&sSearch_1=&bRegex_1=false&bSearchable_1=true&bSortable_1=true&mDataProp_2=2&sSearch_2=&bRegex_2=false&bSearchable_2=true&bSortable_2=true&mDataProp_3=3&sSearch_3=&bRegex_3=false&bSearchable_3=true&bSortable_3=true&mDataProp_4=4&sSearch_4=&bRegex_4=false&bSearchable_4=true&bSortable_4=true&mDataProp_5=5&sSearch_5=&bRegex_5=false&bSearchable_5=true&bSortable_5=true&mDataProp_6=6&sSearch_6=&bRegex_6=false&bSearchable_6=true&bSortable_6=true&sSearch=&bRegex=false&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1&_=1493029905431"
  debugLog("URL for querying is " + url);

  https.get(url, function(response) {
    var body = '';
    response.on('data', function(d) {
      body += d;
    });
    response.on('end', function() {
      debugLog("Unparsed Data - " + body);
      // Data reception is done, do whatever with it!
      var parsed = JSON.parse(body);
      debugLog("Parsed JSON - " + parsed);
      retrievePTINData(blockName, flatNumber, parsed);
    });
  });
}

var processForPTIN = function (inputText) {
  debugLog("Processing for payload " + inputText);
  var blockAndFlatAndSociety = splitInput(inputText);

  if(blockAndFlat != null) {
    var blockName = blockAndFlatAndSociety[0];
    var flatNumber = blockAndFlatAndSociety[1];
    var society = blockAndFlatAndSociety[2];
    debugLog("Querying for Block - " + blockName + " Flat Number - " + flatNumber + " Society - " + society);
    queryGHMCWebsite(blockName, flatNumber,society);
  } else {
    debugLog("Improper data entered for flat number. Please enter in Block-number format for ex: AB-101");
    // sendMessage("Improper data entered for flat number. Please enter in Block-number format for ex: AB-101");
  }
}

var sendMessage = function(message) {
  bot.sendMessage(chatId, message, { parse_mode: "HTML" });
}

var sendHelp = function() {
  var helpMessage = "Send a message with /ptin Block-Flat (ex: /ptin AB-101)";
  sendMessage(helpMessage);
}

bot.onText(/\/ptin (.+)/, (msg, match) => {

  chatId = msg.chat.id;
  const resp = match[1]; // the captured "whatever"
  processForPTIN(match[1]);

});

bot.onText(/\/help/, (msg, match) => {
  chatId = msg.chat.id;
  const resp = match[1]; // the captured "whatever"
  sendHelp();
});

bot.on('message', (msg) => {
  chatId = msg.chat.id;
  const message = msg.text;

  try {
    if(!message.startsWith('/ptin')) {
      log("PTIN command not found, send help");
      sendHelp();
      return;
    }
  } catch(ex) {
    log("Error observed " + ex);
  }
});
