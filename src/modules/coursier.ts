import process from 'process'
import * as path from 'path'
import * as os from 'os'
import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import * as io from '@actions/io'
import * as exec from '@actions/exec'
import {type NonEmptyString} from '../core/types'

/**
 * Install `coursier` and add its executable to the `PATH`.
 *
 * Throws error if the installation fails.
 */
export async function selfInstall(): Promise<void> {
  try {
    const coursierUrl = core.getInput('coursier-cli-url')

    core.debug(`Installing coursier from ${coursierUrl}`)

    const binPath = path.join(os.homedir(), 'bin')
    await io.mkdirP(binPath)

    const zip = await tc.downloadTool(coursierUrl, path.join(binPath, 'cs.gz'))

    await exec.exec('gzip', ['-d', zip], {silent: true})
    await exec.exec('chmod', ['+x', path.join(binPath, 'cs')], {silent: true})

    core.addPath(binPath)

    await exec.exec('cs', ['setup', '--yes', '--jvm', 'adoptium:17'], {
      silent: true,
      listeners: {stdline: core.debug, errline: core.debug},
    })

    let version = ''

    const code = await exec.exec('cs', ['version'], {
      silent: true,
      ignoreReturnCode: true,
      listeners: {stdout(data) {
        (version += data.toString())
      }, errline: core.error},
    })

    if (code !== 0) {
      throw new Error('Coursier didn\t install correctly')
    }

    core.info(`✓ Coursier installed, version: ${version.trim()}`)
  } catch (error: unknown) {
    core.debug((error as Error).message)
    throw new Error('Unable to install coursier')
  }
}

/**
 * Installs an app using `coursier`.
 *
 * Refer to [coursier](https://get-coursier.io/docs/cli-launch) for more information.
 *
 * @param {string} app - The application's name.
 */
export async function install(app: string): Promise<void> {
  const homedir = os.homedir()
  const binPath = path.join(homedir, 'bin')

  let code = await exec.exec('cs', ['install', app, '--install-dir', binPath], {
    silent: true,
    ignoreReturnCode: true,
    listeners: {stdline: core.info, errline: core.debug},
  })

  if (code !== 0) {
    throw new Error(`Installing ${app} failed`)
  }

  let version = ''

  code = await exec.exec(app, ['--version'], {
    silent: true,
    ignoreReturnCode: true,
    listeners: {stdout(data) {
      (version += data.toString())
    }, errline: core.error},
  })

  if (code !== 0) {
    throw new Error(`Installing ${app} failed`)
  }

  core.info(`✓ ${app} installed, version: ${version.trim()}`)
}

/**
 * Launches an app using `coursier`.
 *
 * Refer to [coursier](https://get-coursier.io/docs/cli-launch) for more information.
 *
 * @param app - The application's artifact name.
 * @param version - The application's version.
 * @param args - The args to pass to the application launcher.
 */
export async function launch(
  app: string,
  version: NonEmptyString | undefined,
  args: Array<string | string[]> = [],
): Promise<void> {
  const name = version ? `${app}:${version.value}` : app

  core.startGroup(`Launching ${name}`)

  const launchArgs = [
    'launch',
    '--contrib',
    '-r',
    'sonatype:snapshots',
    name,
    '--',
    ...args.flatMap((arg: string | string[]) => (typeof arg === 'string' ? [arg] : arg)),
  ]

  const code = await exec.exec('cs', launchArgs, {
    silent: true,
    ignoreReturnCode: true,
    listeners: {stdline: core.info, errline: core.error},
  })

  core.endGroup()

  if (code !== 0) {
    throw new Error(`Launching ${name} failed`)
  }
}

/**
 * Removes coursier binary
 */
export async function remove(): Promise<void> {
  await io.rmRF(path.join(os.homedir(), '.cache', 'coursier', 'v1'))
  await exec.exec('cs', ['uninstall', '--all'], {
    silent: true,
    ignoreReturnCode: true,
    listeners: {stdline: core.info, errline: core.error},
  })
  await io.rmRF(path.join(os.homedir(), 'bin', 'cs'))
  await io.rmRF(path.join(os.homedir(), 'bin', 'scalafmt'))
  await io.rmRF(path.join(os.homedir(), 'bin', 'scalafix'))
}
