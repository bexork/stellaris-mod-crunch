import { WriteJSON,EncodeJSON, LoadJSON, logWarn } from '@starkeeper/stellaris-mission-control/core-utils.js'
import path from 'path'

export class Sequencer {

  constructor(options) {
    this.options = options
    if (!this.options.indexRoot) {
      throw new Error('Sequencer options missing indexRoot.')
    }
    this.index = options.startingIndex !== undefined ? options.startingIndex : 0
    this.uniqueNames = {}
  }

  Add(mod) {
    mod.sequence = this.index.toString().padStart(this.options.padLen, this.options.padChar)
    mod.indexDirectoryName = `${mod.sequence}-${mod.cleanName}`
    mod.indexRoot = path.join(this.options.indexRoot, mod.indexDirectoryName)
    mod.crunchFile = LoadJSON(mod.indexRoot, '.crunchfile', {})
    mod.identifier = this.Identify(mod)
    // Start crunchfile in mod source root to make it easy to customize crunching
    WriteJSON(mod.path, '.crunchfile', mod)
    this.index += 1
  }

  Identify(mod) {
    if (!mod.abbrev) {
      let id = []
      const wordsInName = mod.cleanName.split(/\s*/)
      for (const word of wordsInName) {
        if (word.match(/^\d+\.*\d*\.*\d*$/)) {
          id.push('-')
          id.push(word)
        } else {
          id.push(word[0])
        }
      }
      if (mod.gameRegistryId === undefined) {
        mod.gameRegistryId = 'unregistered'
      }
      mod.abbrev = `${id.join('').toUpperCase().padEnd('_', 8)}.${mod.gameRegistryId.padStart('⍟', 8)}`
      if (this.uniqueNames[mod.abbrev] !== undefined) {
        logWarn(`Abbreviated name colission: ${mod.abbrev} is used by ${EncodeJSON(this.uniqueNames[mod.abbrev])}`)
        mod.abbrev = `${mod.abbrev}-COLLISION-`
      }
    }

    this.uniqueNames[mod.abbrev] = mod.cleanName
    return `${mod.sequence}-[${mod.abbrev}]-`
  }
}
