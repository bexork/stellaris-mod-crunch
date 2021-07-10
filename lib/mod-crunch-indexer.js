
import fs from 'fs'
import path from 'path'
import pkg from 'node-7zip'
const { nodeZip } = pkg

import { conf } from '@starkeeper/stellaris-mission-control/core-conf.js'
import { makePng } from '@starkeeper/stellaris-mission-control/core-image.js'
import { getPlayset, getAllReadyToPlay } from '@starkeeper/stellaris-mission-control/core-db.js'

import { Sequencer } from './sequencer.js'
import {
  MkDir,
  MkSym,
  Exists,
  WriteJSON,
  // WriteYAML,
  LoadJSON,
  LoadFile,
  WriteFile,
  // AbortError,
  CleanFileSystemName,
  AbortException,
  // EmptyDirectory,
  logVerbose,
  logInfo,
  logWarn,
  // logError,
  MkDirPaths,
  // DeleteChildDirs
} from '@starkeeper/stellaris-mission-control/core-utils.js'

const ModCrunchStellarisIndexer = () => {
  // Future Parameters

  const indexedMods = {}

  const modSequencer = new Sequencer({ padChar: '0', padLen: 3, indexRoot: conf.index.mod })
  const allSequencer = new Sequencer({ padChar: 'X', padLen: 3, indexRoot: conf.index.all })
  const mergeSequencer = new Sequencer({ padChar: '0', padLen: 3, indexRoot: conf.index.merge, merge: true })

  /** Files that exist at root (Stellaris) but have been overriden */
  const rootOverrides = {}

  /** media included by mods */
  const includedMedia = []

  const IndexedModDirectories = [
    'common',
    'events',
    'flags',
    'fonts',
    'gfx',
    'interface',
    'locales',
    'localisation',
    'localisation_synched',
    'map',
    'music',
    'prescripted_countries',
    'sound'
  ]

  const mediaTypes = ['.dds', '.tga', '.png', '.tiff', '.ogg', '.wav', '.mesh']
  const imageTypes = ['.dds', '.tga', '.png', '.tiff']

  // const ScriptDangerPaths = ['common/on_actions/', 'events']

  // const GxfDangerPaths = ['interface', 'gfx', 'flags', 'flags/colors.txt']
  const prepareOutputDirectories = () => {

    if (!fs.existsSync(conf.root)) {
      throw new Error(`STELLARIS ROOT IS NOT CORRECT: ${conf.root}`)
    }
    // if (!EmptyDirectory(conf.index.root)) {
    //   // logError('🚀 Aborting! Must start with an empty Index Directory.')
    //   // throw new Error(`ERROR: ${conf.index.root} Directory is OCCUPIED.🚀 Please Delete manually and run again.`)
    //   DeleteChildDirs(conf.index.root)
    // }

    if (Exists(conf.index.merge)) {
      if (conf.index.cleanMerge) {
        RocketDirectory(conf.index.merge)
      }
    }

    MkDir(conf.index.root, /** ifNotExist */ true)
    MkDir(conf.index.stellaris, /** ifNotExist */ true)
    MkDir(conf.index.mod, /** ifNotExist */ true)
    MkDir(conf.index.all, /** ifNotExist */ true)
    MkDir(conf.index.merge, /** ifNotExist */ true)
    MkDir(conf.index.mod_crunch, /** ifNotExist */ true)
    MkDir(conf.index.links, /** ifNotExist */ true)


    const descriptor = LoadFile(process.cwd(), 'descriptor.mod')
    WriteFile(conf.index.merge, 'descriptor.mod', descriptor)

    /**
     * Create symlinks to log files and Stellaris Dirrectories fogit statr easy access.
     */
    MkSym(conf.root, path.join(conf.index.links, '000_StellarisInstall'), 'dir')
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
        stellaris: true
      }

      prepareOutputDirectories()

      logInfo(' *🚀* Indexing Stellaris Root *🚀*')
      addModToIndex(stellaris, {
        sequencer: modSequencer,
        indexRoot: conf.index.stellaris,
        merge: false
      })

      logInfo(' *🚀* Indexing Stellaris Playlist *🚀*')
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

      logInfo(' *🚀* Indexing Stellaris Playlist For Mod Merge *🚀*')
      indexMods(activePlaylist, {
        sequencer: mergeSequencer,
        indexRoot: conf.index.merge,
        merge: true,
        images: false
      })

      logInfo('*🚀* Indexing Complete!! *🚀*')
      WriteJSON(conf.index.mod_crunch, 'crunch.json',
        {
          rootOverrides,
          includedMedia,
          indexedMods
        })

    } catch (error) {
      AbortException('Indexing Failed', error)
    }
  }

  const addModToIndex = (mod, options) => {
    const crunchFile = LoadJSON(mod.path, '.crunch2')
    if (crunchFile) {
      options.crunch = crunchFile
    } else {
      options.crunch = {}
    }

    // if (fs.existsSync(path.join(mod.path, '.nomunge'))) {
    //   options.crunch.nomunge = true
    // }

    options.crunch.nomunge = true

    if (fs.existsSync(path.join(mod.path, '.skip'))) {
      logWarn(`WARNING: .skip crunch for ${mod.name} at ${mod.path}`)
      return
    }


    if (!options.merge) {
      if (indexedMods[mod.cleanName] !== undefined) {
        logWarn(`WARNING: Skipping Previously Indexed Mod: ${mod.cleanName}`)
        return
      }
      indexedMods[mod.cleanName] = mod
    }

    if (fs.existsSync(mod.path)) {
      options.sequencer.Add(mod, options)
      if (handleZipFile(mod)) {
        logWarn(`INFO: Archive File Mod ${mod.name} at ${mod.unzippedPath}`)
      }
      logInfo(`INDEXING: ${mod.cleanName} from=${mod.path} to=${mod.indexRoot}`)
      if (!options.merge) {
        MkSym(mod.path, mod.indexRoot, 'dir')
      } else {
        MkDir(mod.indexRoot, true)
        indexModDirectory(mod.path, mod, options)
      }
    }
  }

  const indexModDirectory = (modSourceRoot, mod, options) => {
    for (const modScanPath of IndexedModDirectories) {
      const modScanRoot = path.join(modSourceRoot, modScanPath)
      if (Exists(modScanRoot)) {
        const indexFilePath = path.join(mod.indexRoot, modScanPath)
        MkDir(indexFilePath, true /* ifNotExists */)
        indexModFiles(mod, modScanRoot, modScanPath, indexFilePath, options)
      }
    }
  }


  const RocketDirectory = (pathRoot) => {
    let index = 0
    let newPathName = false
    while (!newPathName) {
      console.warn(`🚀🚀🚀 ${pathRoot} (${index})`)
      const dir = path.dirname(pathRoot)
      const fname = path.basename(pathRoot)
      const tryPath = path.join(dir,  `${fname}-🚀(${index.toString().padStart(3,'0')})`)
      if (!Exists(tryPath)) {
        newPathName = tryPath
      }
      index += 1
      if (index > 100) {
        throw new Error(`Giving Up after ${index} tries. Something is wrong with this ${pathRoot} renaming to ${newPathName}`)
      }
    }
    console.warn(`🚀 Fresh Directory ${pathRoot} => previous: ${newPathName} is hiding`)
    fs.renameSync(pathRoot, newPathName)
  }

  const RocketExtension = (pathRoot, mod) => {
    let index = 0
    let newPathName = false
    while (!newPathName) {
      console.warn(`🚀🚀🚀 ${pathRoot} (${index})`)
      const dir = path.dirname(pathRoot)
      const ext = path.extname(pathRoot)
      const file = path.basename(pathRoot, ext)
      MkDirPaths(dir, '.rocket', true)
      const tryPath = path.join(dir, '.rocket', `${file}_${ext.substring(1)}-(${index.toString().padStart(3,'0')}).🚀`)
      if (!Exists(tryPath)) {
        newPathName = tryPath
      }
      index += 1
      if (index > 100) {
        throw new Error(`Giving Up after ${index} tries. Something is wrong with this ${pathRoot} renaming to ${newPathName}`)
      }
    }
    console.warn(`🚀 ${mod.cleanName} replacing ${pathRoot} => previous: ${newPathName} will not be loaded`)
    fs.renameSync(pathRoot, newPathName)

    if (!mod.replacedFiles) mod.replacedFiles = []
    mod.replacedFiles.push(newPathName)
  }


  const getMungedFileName = (mod, options, indexedModDirectory, indexPath, file) => {
    // check if the file exists in stellaris
    // and don't munge it if it does
    const modFile = path.join(mod.path, indexedModDirectory, file)
    const indexFile = path.join(mod.indexRoot, indexedModDirectory, file)
    const rootOverrideFile = path.join(conf.root, indexedModDirectory, file)
    const rootExists = Exists(rootOverrideFile)
    const unmungedFile = path.join(indexPath, file)
 //   const mungedFile = path.join(indexPath, `${mod.identifier}-${file}`)
    const isMedia = mediaTypes.includes(path.extname(file))
    // const isImage = imageTypes.includes(path.extname(file))

    let result

    if (isMedia) {
      result = unmungedFile
      console.warn(`Munger: Not Munging Media ${result}`)
    }

    if (!result && options.crunch.nomunge && rootExists) {
      result = unmungedFile
      console.warn(`Munger: Not munging ${result}`)
    }

    if (!result) {
      // this is not media and it is not overriding a file from root (Stellaris)
      result = unmungedFile // mungedFile
      console.warn(`Munger: Munged ${path.join(indexPath, file)} => ${result}`)
    }

    if (rootExists) {
      // this is media or overriding a file
      rootOverrides[rootOverrideFile] = { rootOverrideFile, mod, modFile, indexFile }
      console.warn(`Munger: Overriding ${rootOverrideFile} ==> ${modFile}`)
    }

    if (Exists(result)) {
      // Expect to see renames of existing file
      console.warn(`Munger: File Exists in destination: ${result}`)
    }

    return result
  }

  const indexModFiles = (mod, modScanRoot, modScanPath, indexPath, options) => {
    const files = fs.readdirSync(modScanRoot, { withFileTypes: true})
    for (const dirEnt of files) {
      const modFilePath = path.join(modScanRoot, dirEnt.name)
      if (dirEnt.isDirectory()) {
        logVerbose(`       Directory: ${modFilePath} => ${indexPath}`)
        const newIndexDir = MkDirPaths(indexPath, dirEnt.name, true /** it might exist we are doing multiple mods */)
        indexModFiles(mod, modFilePath, path.join(modScanPath, dirEnt.name), newIndexDir, options)
      } else if (dirEnt.isFile()) {
        // If it is a media file then do not munge the name
        const isMedia = mediaTypes.includes(path.extname(dirEnt.name))
        const isImage = imageTypes.includes(path.extname(dirEnt.name))
        const indexFilePath = getMungedFileName(mod, options, modScanPath, indexPath, dirEnt.name)
        logVerbose(`       Symlink: ${modFilePath} => ${indexFilePath}`)
        if (Exists(indexFilePath)) {
          // Jet the other file on out like Elon Musk *🚀*
          RocketExtension(indexFilePath, mod)
        }
        // This file will be the loaded one
        MkSym(modFilePath, indexFilePath, 'file')

        // do images
        if (isMedia) {
          includedMedia.push(modFilePath)
          if (options.images && isImage) {
            makePng(modFilePath, 'crunch', 100, indexPath)
          }
        }
      } else if (dirEnt.isSymbolicLink()) {
        console.warn('Warning: encountered a symlink while scanning. Are we scanning the correct directories?')
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
    mod.unzippedPath = mod.indexRoot
    if (options.merge) {
      const modDescriptor = LoadJSON(mod.path, 'descriptor.mod')
      modDescriptor.crunchedPath = modDescriptor.path
      modDescriptor.oldArchivePath = modDescriptor.archivePath
      delete modDescriptor.archivePath
      modDescriptor.path          = mod.indexRoot
      WriteJSON(mod.path, 'descriptor.mod', modDescriptor)
    }
    return true
  }

  StartIndexing()
}

export { ModCrunchStellarisIndexer as default }
