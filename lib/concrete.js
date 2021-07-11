import { AbortException, WriteFile, LoadFile, MkDirPaths } from '@starkeeper/stellaris-mission-control/core-utils.js'
import { conf } from '@starkeeper/stellaris-mission-control/core-conf.js'
import path from 'path'
import { tar, untar } from './archive.js'
import shell from 'shelljs'

const nextVersion = (version) => {
  const parts = version.split('.')
  const thisVersion = parseInt(parts[2])
  const nextVersion = thisVersion + 1
  return `${parts[0]}.${parts[1]}.${nextVersion}`
}

const main = async function () {
  try {
    process.on('uncaughtException', function (err) {
      console.error('UNCAUGHT EXCEPTION ')
      console.error(err.stack ? err.stack : 'NO STACK TRACE AVAILABLE')
    })
    const buildZip = path.join(conf.index.root, 'build.tar')
    await tar(conf.index.merge, buildZip)

    const buildDir = MkDirPaths(conf.index.merge, '.build', /** ifNotExist */ true)
    await untar(buildZip, buildDir, true)

    const descriptorSrc = LoadFile(process.cwd(), 'descriptor.mod')
    WriteFile(buildDir, 'descriptor.mod', descriptorSrc.replace('$PATH', buildDir.replace(/\\/g, '/')))
    console.log('BUILD COMPLETE')
    shell.exec(`explorer "${buildDir}"`, {async: true, silent: true})
  } catch (exception) {
    AbortException('Failed at outer exception handler', exception)
  }
}

main(process.argv)
