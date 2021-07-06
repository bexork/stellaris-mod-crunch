
import fs from 'fs'
import path from 'path'
import pkg from 'node-7zip'
const { nodeZip } = pkg

import { conf } from '@starkeeper/stellaris-mission-control/core-conf.js'
import { makePng } from '@starkeeper/stellaris-mission-control/core-image.js'
import { Sequencer } from './sequencer.js'
import { getPlayset, getAllReadyToPlay } from '@starkeeper/stellaris-mission-control/stellaris-db.js'
import {
  MkDir,
  MkSym,
  Exists,
  WriteJSON,
  LoadJSON,
  AbortError,
  CleanFileSystemName,
  AbortException,
  EmptyDirectory,
  logVerbose,
  logInfo,
  logWarn,
  // logError,
  MkDirPaths,
  DeleteChildDirs
} from '@starkeeper/stellaris-mission-control/core-utils.js'

export const ModCrunchStellarisIndexer = () => {
  // Future Parameters

  const indexedMods = {}

  const modSequencer = new Sequencer({ padChar: '0', padLen: 6, indexRoot: conf.index.mod })
  const allSequencer = new Sequencer({ padChar: 'X', padLen: 6, indexRoot: conf.index.all })
  const mergeSequencer = new Sequencer({ padChar: '0', padLen: 6, indexRoot: conf.index.merge, merge: true })

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

    if (!fs.existsSync(conf.root)) {
      throw new Error(`STELLARIS ROOT IS NOT CORRECT: ${conf.root}`)
    }
    if (!EmptyDirectory(conf.index.root)) {
      // logError('🚀 Aborting! Must start with an empty Index Directory.')
      // throw new Error(`ERROR: ${conf.index.root} Directory is OCCUPIED.🚀 Please Delete manually and run again.`)
      DeleteChildDirs(conf.index.root)
    }

    MkDir(conf.index.root, /** ifNotExist */ true)
    MkDir(conf.index.stellaris, /** ifNotExist */ true)
    MkDir(conf.index.mod, /** ifNotExist */ true)
    MkDir(conf.index.all, /** ifNotExist */ true)
    MkDir(conf.index.merge, /** ifNotExist */ true)
    MkDir(conf.index.mod_crunch, /** ifNotExist */ true)
    MkDir(conf.index.links, /** ifNotExist */ true)

    /**
     * Create symlinks to log files and Stellaris Dirrectories fogit statr easy access.
     */
    MkSym(conf.root,           path.join(conf.index.links, '000_StellarisInstall'), 'dir')
    MkSym(conf.documents.root, path.join(conf.index.links, '002_StellarisDocuments'), 'dir')
    MkSym(conf.documents.logs, path.join(conf.index.links, '003_Logs'), 'dir')
  }

  const StartIndexing = () => {
    try {
      // ultimate search order = Stellaris, Active Mod List, All Mods
      const stellaris = {
        name: 'Stellaris',
        cleanName: 'Stellaris',
        abbrev: '[STELLA]',
        path: conf.root,
      }

      prepareOutputDirectories()

      logInfo(' *🚀* Indexing Stellaris Root *🚀*')
      addModToIndex(stellaris, {
        sequencer: modSequencer,
        indexRoot: conf.index.stellaris,
        merge: false
      })

      // logInfo(' *🚀* Indexing Stellaris Playlist *🚀*')
      const activePlaylist = getPlayset()
      logInfo(`        Loaded ${activePlaylist.length} from DB`)
      indexMods(activePlaylist, {
        sequencer: modSequencer,
        indexRoot: conf.index.mod,
        merge: false
      })

      logInfo(' *🚀* Indexing All Installed Mods *🚀*')
      const allLoadedMods = getAllReadyToPlay()
      logInfo(`       Loaded ${allLoadedMods.length} from DB`)

      indexMods(allLoadedMods, {
        sequencer: allSequencer,
        indexRoot: conf.index.all,
        merge: false
      })

      logInfo(' *🚀* Indexing Stellaris Root For Mod Merge *🚀*')
      addModToIndex(stellaris, {
        sequencer: mergeSequencer,
        indexRoot: conf.index.merge,
        merge: true
      })

      logInfo(' *🚀* Indexing Stellaris Playlist For Mod Merge *🚀*')
      indexMods(activePlaylist, {
        sequencer: mergeSequencer,
        indexRoot: conf.index.merge,
        merge: true
      })

      logInfo('*🚀* Indexing Complete!! *🚀*')
      WriteJSON(conf.index.mod_crunch, 'crunch.log', indexedMods)
    } catch (error) {
      AbortException('Indexing Failed', error)
    }
  }

  const addModToIndex = (mod, options) => {
    if (indexedMods[`${mod.cleanName}-${options.merge? 'merge' : 'no'}`] !== undefined) {
      logWarn(`WARNING: Skipping Previously Indexed Mod: ${mod.cleanName}`)
      return
    }

    indexedMods[`${mod.cleanName}-${options.merge? 'merge' : 'no'}`] = mod

    if (fs.existsSync(mod.path)) {
      if (!fs.existsSync(path.join(mod.path, '.skip'))) {
        options.sequencer.Add(mod, options)
        if (handleZipFile(mod)) {
          logWarn(`INFO: Archive File Mod ${mod.name} at ${mod.unzippedPath}`)
        }
        logInfo(`INDEXING: ${mod.cleanName} from=${mod.path} to=${mod.indexRoot}`)
        if (!options.merge) {
          MkSym(mod.path, path.normalize(mod.indexRoot), 'dir')
        } else {
          MkDir(mod.indexRoot, true)
          indexModDirectory(mod.path, mod, options)
        }
      } else {
        logWarn(`WARNING: .skip crunch for ${mod.name} at ${mod.path}`)
      }
    }
  }

  const indexModDirectory = (modSourceRoot, mod, options) => {
    for (const indexedModDirectory of IndexedModDirectories) {
      const modScanPath = path.join(modSourceRoot, indexedModDirectory)
      if (Exists(modScanPath)) {
        const indexFilePath = path.join(mod.indexRoot, indexedModDirectory)
        MkDir(indexFilePath, true /* ifNotExists */)
        indexModFiles(mod, modScanPath, indexFilePath, options)
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
      const stat = fs.statSync(modFilePath)
      if (stat.isDirectory()) {
        logVerbose(`       Directory: ${modFilePath} => ${indexPath}`)
        const newIndexDir = MkDirPaths(indexPath, file, true /** it might exist we are doing multiple mods */)
        indexModFiles(mod, modFilePath, newIndexDir, options)
      } else if (stat.isFile()) {
        const fileType = path.extname(file)
        const indexFilePath = path.join(indexPath, `${mod.identifier}.${file.replace('.', '_')}.🚀🚀🚀`)
        logVerbose(`       Symlink: ${modFilePath} => ${indexFilePath}`)
        MkSym(modFilePath, path.normalize(indexFilePath), 'file')
        // these files are probably media files and may be referenced from scripts
        // this should make the mangled names loadable as long as the game does Not
        // mind unicode in western file systems
        const canBeMerged = ['', '.txt', '.json', '.yaml', '.yml', '.shader', '.gui', '.settings', '.asset', '.gfx']
        if (!canBeMerged.includes(fileType)) {
          const makePng = ['.dds', '.tga']
          if (makePng.includes(fileType)) {
            makePng(modFilePath, 'crunch', 400, indexPath)
          }
          const nakedIndexSym = path.join(indexPath, file)
          MkSym(modFilePath, path.normalize(nakedIndexSym), 'file', true /** ifNotExists */)
          ImageMag
        }
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

  const handleZipFile = (mod, options = {}) => {
    if (!mod.archivePath) return false
    nodeZip.unzip(mod.archivePath, mod.indexRoot)
    if (options.prepareExecutable) {
      const modDescriptor = LoadJSON(mod.path, 'descriptor.mod')
      modDescriptor.crunchedPath = modDescriptor.path
      delete modDescriptor.archivePath
      modDescriptor.path          = mod.indexRoot
      WriteJSON(mod.path, 'descriptor.mod', modDescriptor)
    }
    return true
  }

  StartIndexing()
}
