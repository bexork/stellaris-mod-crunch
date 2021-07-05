import { ModCrunchStellarisIndexer } from './mod-crunch-indexer.js'
import process from 'process'
import { AbortException } from '@starkeeper/stellaris-mission-control/core-utils.js'

try {
  process.on('uncaughtException', function (err) {
    console.error('UNCAUGHT EXCEPTION ')
    console.error(err.stack ? err.stack : 'NO STACK TRACE AVAILABLE')
  })
  ModCrunchStellarisIndexer().Index()
} catch (exception) {
  AbortException('Failed at outer exception handler', exception)
}
