/**
 * MIT License
   Copyright (c) 2017 Kris Hollenbeck
   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
   documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
   rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
   persons to whom the Software is furnished to do so, subject to the following conditions:
   The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
   Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
   TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS
   OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
   OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { execFile } from 'child_process'

export const unzip = async function (pathToArchive, target, overwrite = false)
{
  console.log('Unzipping from ' + pathToArchive + ' to ' + target)

  const process = new Promise((resolve, reject) => {
    var args = ['x', pathToArchive, '-o' + target, '-r']
    if (overwrite)
    {
      args.push('-aoa')
    }
    else
    {
      args.push('-aos')
    }

    execFile('./lib/bin/7za.exe', args, (error, stdout, stderr) =>
    {
      if (error)
      {
        console.error('stderr', stderr)
        reject(stderr)
        throw error
      }
      resolve('stdout', stdout)
    })
  })

  return process
}

export const zip = async function(input, output)
{
  console.log('Zipping from ' + input + ' to ' + output)
  const process = new Promise((resolve, reject) => {
    execFile('./lib/bin/7za.exe', ['a', '-t7z', output, input + '/*', '-r'], (error, stdout, stderr) => {
      if (error) {
        console.error('stderr', stderr)
        reject(stderr)
        throw error
      }
      resolve('stdout', stdout)
    })
  })

  return process
}

export const tar = async function(input, output)
{
  console.log('Tarring from ' + input + ' to ' + output)
  const process = new Promise((resolve, reject) => {
    execFile('./lib/bin/7za.exe', ['a', '-ttar', output, input + '/*', '-r'], (error, stdout, stderr) => {
      if (error) {
        console.error('stderr', stderr)
        reject(stderr)
        throw error
      }
      resolve('stdout', stdout)
    })
  })

  return process
}

export const untar = async function (pathToArchive, target, overwrite = false)
{
  console.log('Untarring from ' + pathToArchive + ' to ' + target)

  const process = new Promise((resolve, reject) => {
    var args = ['x', pathToArchive, '-o' + target, '-r', '-spe']
    if (overwrite)
    {
      args.push('-aoa')
    }
    else
    {
      args.push('-aos')
    }

    execFile('./lib/bin/7za.exe', args, (error, stdout, stderr) =>
    {
      if (error)
      {
        console.error('stderr', stderr)
        reject(stderr)
        throw error
      }
      resolve('stdout', stdout)
    })
  })

  return process
}
