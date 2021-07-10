import { EncodeJSON, logWarn } from '@starkeeper/stellaris-mission-control/core-utils.js'
import path from 'path'

export class Sequencer {

  constructor(options) {
    this.options = options
    if (!this.options.indexRoot) {
      throw new Error('Sequencer options missing indexRoot.')
    }
    // if (!this.options.name) {
    //   throw new Error('Sequencer options missing name.')
    // }

    this.index = options.startingIndex !== undefined ? options.startingIndex : 0
    this.uniqueNames = {}
  }

  Add(mod) {
    mod.sequence = this.index.toString().padStart(this.options.padLen, this.options.padChar)
    if (this.options.merge) {
      // '000-🚀🚀🚀-Stellaris'
      mod.indexDirectoryName = this.options.mergeRootName ? this.options.mergeRootName : ''
      mod.indexRoot = path.join(this.options.indexRoot, mod.indexDirectoryName)
    } else {
      mod.indexDirectoryName = `${mod.sequence}-${mod.cleanName}`
      mod.indexRoot = path.join(this.options.indexRoot, mod.indexDirectoryName)
    }
    mod.identifier = this.Identify(mod)
    // Start crunchfile in mod source root to make it easy to customize crunching
    this.index += 1
  }

  Identify(mod) {
    if (mod.cleanName === 'Stellaris') {
      return '000.[STELLA]'
    }
    if (!mod.abbrev) {
      if (mod.steamId === undefined) {
        mod.steamId = 'TBD'
      }
      mod.abbrev = `${mod.cleanName.substring(0, 12).replace(' ', '_')}-${mod.steamId}`
      if (this.uniqueNames[mod.abbrev] !== undefined) {
        logWarn(`Abbreviated name colission: ${mod.abbrev} is used by ${EncodeJSON(this.uniqueNames[mod.abbrev])}`)
        mod.abbrev = `${mod.abbrev}-COLLISION-`
      }
    }

    this.uniqueNames[mod.abbrev] = mod.cleanName
    return `${mod.sequence}-[${mod.abbrev}]`
  }
}
