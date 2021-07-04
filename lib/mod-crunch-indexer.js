
import fs from 'fs'
import path from 'path'
import { nodeZip } from 'node-7zip'

import { Sequencer } from './sequencer.js'
import { conf } from '@starkeeper/stellaris-mission-control/stellaris-conf.js'
import { db } from '@starkeeper/stellaris-mission-control/stellaris-db.js'
import {
  MkDir,
  MkSym,
  Exists,
  WriteJSON,
  AbortError,
  CleanFileSystemName,
  AbortException,
  EmptyDirectory,
  logVerbose,
  logInfo,
  logWarn,
  logError
} from 'starkeeper@/stellaris-mission-control/core-utils.js'

export const ModCrunchStellarisIndexer = () => {
  // Future Parameters

  const indexedMods = {}
  const modSequencer = new Sequencer({ padChar: '0', padLen: 5, indexRoot: conf.index.mod })
  const allSequencer = new Sequencer({ padChar: 'X', padLen: 5, indexRoot: conf.index.all })
  const mergeSequencer = new Sequencer({ padChar: '🚀', padLen: 5, indexRoot: conf.index.merge })

  const IndexedModDirectories = [
    'common',
    'events',
    'prescripted_countries',
    'map',

    'flags',
    'interface',
    'gfx',

    'music',
    'sound',
    'locales',
    'localisation',
    'fonts',
  ]

  // const ScriptDangerPaths = ['common/on_actions/', 'events']

  // const GxfDangerPaths = ['interface', 'gfx', 'flags', 'flags/colors.txt']
  const prepareOutputDirectories = () => {

    if (!fs.existsSync(conf.stellaris.root)) {
      throw new Error(`STELLARIS ROOT IS NOT CORRECT: ${conf.stellaris.root}`)
    }
    if (!EmptyDirectory(conf.stellaris.index.root)) {
      logError('🚀 Aborting! Must start with an empty Index Directory.')
      throw new Error(`ERROR: ${conf.stellaris.index.root} Directory is OCCUPIED.🚀 Please Delete manually and run again.`)
    }

    MkDir(conf.stellaris.index.root)
    MkDir(conf.stellaris.index.stellaris)
    MkDir(conf.stellaris.index.mod)
    MkDir(conf.stellaris.index.all)
    MkDir(conf.stellaris.index.merge)
    MkDir(conf.stellaris.index.mod_crunch)
    MkDir(conf.stellaris.index.links)

    /**
     * Create symlinks to log files and Stellaris Dirrectories fogit statr easy access.
     */
    MkDir(conf.stellaris.index.links)
    MkSym(conf.stellaris.root, path.join(conf.stellaris.index.links,'000_StellarisInstall'), 'dir', true        /** ignoreErrors */)
    MkSym(conf.stellaris.documents, path.join(conf.stellaris.index.links, '002_StellarisDocs'), 'dir', true  /** ignoreErrors */)
    MkSym(conf.stellaris.documents.logs, path.join(conf.stellaris.index.links, '003_Logs'), 'dir', true           /** ignoreErrors */)
  }

  const StartIndexing = () => {
    try {
      // ultimate search order = Stellaris, Active Mod List, All Mods
      const stellaris = {
        name: 'Stellaris',
        cleanName: 'Stellaris',
        path: conf.stellaris.root,
      }

      prepareOutputDirectories()

      logInfo(' *🚀* Indexing Stellaris Root *🚀*')
      addModToIndex(stellaris, {
        sequencer: modSequencer,
        indexRoot: conf.stellaris.index.stellaris,
        merge: false
      })

      logInfo(' *🚀* Indexing Stellaris Playlist *🚀*')
      const activePlaylist = db.getPlaylistSync()
      logInfo(`        Loaded ${activePlaylist.length} from DB`)
      indexMods(activePlaylist, {
        sequencer: modSequencer,
        indexRoot: conf.stellaris.index.mod,
        merge: false
      })

      logInfo(' *🚀* Indexing Stellaris Root For Mod Merge *🚀*')
      addModToIndex(stellaris, {
        sequencer: mergeSequencer,
        indexRoot: conf.stellaris.index.merge,
        merge: true
      })

      logInfo(' *🚀* Indexing Stellaris Playlist For Mod Merge *🚀*')
      indexMods(activePlaylist, {
        sequencer: mergeSequencer,
        indexRoot: conf.stellaris.index.merge,
        merge: true
      })

      logInfo(' *🚀* Indexing All Installed Mods *🚀*')
      const allLoadedMods = db.getAllReadyToPlay()
      logInfo(`       Loaded ${allLoadedMods.length} from DB`)

      indexMods(allLoadedMods, {
        sequencer: allSequencer,
        indexRoot: conf.stellaris.index.all,
        merge: false
      })
      logInfo('*🚀* Indexing Complete!! *🚀*')
      WriteJSON(conf.stellaris.index.mod_crunch, 'crunch.log', indexedMods)
    } catch (error) {
      AbortException('Indexing Failed', error)
    }
  }

  const addModToIndex = (mod, options) => {
    if (fs.existsSync(mod.path)) {
      if (!fs.existsSync(path.join(mod.path, '.skip'))) {
        options.sequencer.Add(mod, options)
        if (handleZipFile(mod)) {
          logInfo(`INFO: Archive File Mod ${mod.name} at ${mod.unzippedPath}`)
          indexModDirectory(mod.unzippedPath, mod, options)
        } else {
          indexModDirectory(mod.path, mod, options)
        }
      } else {
        logWarn(`WARNING: .skip crunch for ${mod.name} at ${mod.path}`)
      }
    }
  }

  const indexModDirectory = (modSourceRoot, mod, options) => {
    if (indexedMods[mod.cleanName] !== undefined) {
      logWarn(`WARNING: Skipping Previously Indexed Mod: ${mod.cleanName}`)
      return
    }

    logInfo(`INDEXING: ${mod.cleanName} from=${modSourceRoot} to=${mod.indexRoot}`)
    indexedMods[mod.cleanName] = mod

    if (!options.merge) {
      MkSym(modSourceRoot, path.normalize(mod.indexRoot), 'dir')
    } else {
      MkDir(mod.indexRoot)
    }

    if (options.merge) {
      for (const indexedModDirectory of IndexedModDirectories) {
        const modScanPath = path.join(modSourceRoot, indexedModDirectory)
        if (Exists(modScanPath)) {
          logVerbose(`        Indexing: ${modScanPath}`)
          const indexFilePath = path.join(mod.indexRoot, indexedModDirectory)
          MkDir(indexFilePath)
          indexModFiles(mod, modScanPath, indexFilePath, options)
        }
      }
    }
  }

  const indexModFiles = (mod, modScanPath, indexPath, options) => {
    if (!fs.existsSync(modScanPath)) {
      return
    }
    if (!mod.identifier) {
      AbortError('Mod Identifier Not Set! This is very fishy!')
    }
    const files = fs.readdirSync(modScanPath)
    for (const file of files) {
      const modFilePath = path.join(modScanPath, file)
      const indexFilePath = path.join(indexPath, `${mod.identifier}-${file}`)
      const stat = fs.statSync(modFilePath)
      if (stat.isDirectory()) {
        logVerbose(`       Directory: ${modFilePath} => ${indexFilePath}`)
        MkDir(indexFilePath)
        indexModFiles(mod, modFilePath, indexFilePath, options)
      } else if (stat.isFile()) {
        logVerbose(`       Symlink: ${modFilePath} => ${indexFilePath}`)
        MkSym(modFilePath, path.normalize(indexFilePath), 'file')
      }
    }
  }

  const indexMods = (results, options) => {
    for (const row of results) {
      addModToIndex(
        {
          name: row.displayName,
          cleanName: CleanFileSystemName(row.displayName),
          path: row.dirPath,
          picture: row.thumbnailUrl,
          tags: JSON.parse(row.tags),
          steamId: row.steamId,
          gameRegistryId: row.gameRegistryId,
          requiredVersion: row.requiredVersion,
          version: row.version,
          position: row.position,
          loadOrder: row.loadOrder,
          playlist: row.name,
          size: row.size,
          playsetId: row.playsetId,
        },
        options
      )
    }
  }

  const handleZipFile = (mod) => {
    if (!mod.archivePath) return false
    mod.unzippedPath = path.join(mod.indexRoot, 'Zipped')
    MkDir(mod.unzippedPath)
    nodeZip.unzip(mod.archivePath, mod.unzippedPath)
    return true
  }

  StartIndexing()
}
