const ModCrunchStellarisIndexer = require('./mod-crunch-indexer');

const Index = async () => {
    console.log("Index Begin");
    await ModCrunchStellarisIndexer().Index();
    console.log("Index Complete");
}

try {
    process.on('uncaughtException', function (err) {
        console.error( "UNCAUGHT EXCEPTION " );
        console.error(err.stack ? err.stack : 'NO STACK TRACE AVAILABLE');
    });    
    Index();
} catch (exception) {
    AbortException('Failed at outer exception handler', exception);
}
