import type { EngineInterface, On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { PrBarPr } from '../types'
import { buttons, load, summarise } from './register'

// Shapes as `gh pr view --json ...` and the reviewThreads query print them (checked against a real repository).
const PR = {
  number: 128,
  title: 'feat(app): let pull to refresh start on the home screen on iOS and Android',
  url: 'https://github.com/octo-org/app/pull/128',
  state: 'OPEN',
  isDraft: true,
  reviewDecision: 'CHANGES_REQUESTED',
  statusCheckRollup: [
    { __typename: 'CheckRun', name: 'lint', workflowName: 'App', status: 'COMPLETED', conclusion: 'SUCCESS', detailsUrl: 'https://ci/lint' },
    { __typename: 'CheckRun', name: 'docs', workflowName: 'App', status: 'COMPLETED', conclusion: 'SKIPPED', detailsUrl: 'https://ci/docs' },
    { __typename: 'CheckRun', name: 'test', workflowName: 'App', status: 'COMPLETED', conclusion: 'FAILURE', detailsUrl: 'https://ci/test' },
    { __typename: 'CheckRun', name: 'deploy', workflowName: 'App', status: 'IN_PROGRESS', conclusion: '', detailsUrl: 'https://ci/deploy' },
    { __typename: 'StatusContext', context: 'ci/legacy', state: 'PENDING', targetUrl: 'https://legacy' },
  ],
}
const thread = (isResolved: boolean, path: string, line: number | null, body: string) => ({
  isResolved,
  path,
  line,
  comments: { nodes: [{ author: { login: 'octocat' }, body, url: `${PR.url}#${path}` }] },
})
const THREADS = {
  data: {
    repository: {
      pullRequest: {
        reviewThreads: {
          nodes: [
            thread(false, 'src/feed/useVideoPreloader.ts', 134, '\nShould this guard against a missing ref?\n\nDetails...'),
            thread(true, 'src/old.ts', 3, 'Done'),
            thread(false, 'src/services/group.ts', null, 'This doc is inaccurate.'),
          ],
        },
      },
    },
  },
}

type Out = { exitCode?: number; stdout?: string; stderr?: string }
type Table = Record<string, Out>

const WITH_PR: Table = {
  'git rev-parse --abbrev-ref': { stdout: 'feat/pull-to-refresh\n' },
  'git status --porcelain': { stdout: '' },
  'gh pr view': { stdout: JSON.stringify(PR) },
  'gh api graphql': { stdout: JSON.stringify(THREADS) },
}
const NO_PR: Table = {
  ...WITH_PR,
  'gh pr view': { exitCode: 1, stderr: 'no pull requests found for branch "feat/pull-to-refresh"\n' },
}

// Answers a command from the table by its first three words; anything else exits 1.
const run = (table: Table, argv: readonly string[]) => ({
  exitCode: 0,
  stdout: '',
  stderr: '',
  isStdoutTruncated: false,
  isStderrTruncated: false,
  ...(table[argv.slice(0, 3).join(' ')] ?? { exitCode: 1 }),
})

const fake = (table: Table, ran: string[] = []) =>
  ({ process: { run: async (argv: readonly string[]) => (ran.push(argv.join(' ')), run(table, argv)) } }) as unknown as EngineInterface

const PANEL = {
  component: 'Pane',
  requestId: 'pr',
  props: {
    title: 'Pull request',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 9 }, view: {} },
} as const

const texts = async (ui: { findAll: (q: object) => Promise<readonly { type: string; text?: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(el => el.text)

// Stands in for the engine beneath the plugin, starts the session, and records what it submits and opens.
async function start($: Engine, on: On, table: Table) {
  const sent: string[] = []
  const opened: string[] = []
  const clock = mock.clock(on)
  on('process.run', ($, e) => ({ value: run(table, e.argv) }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.open', ($, e) => (opened.push(e.focus ? `${e.id} (focused)` : e.id), { value: { isPlaced: true as const } }))
  on('prompt.submit', ($, e) => (sent.push(e.text), { text: e.text }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await clock.settle()
  return { sent, opened }
}

test('summarises statusCheckRollup as gh pr checks buckets it', async () => {
  expect(summarise(PR.statusCheckRollup)).toEqual({ passed: 2, failed: 1, pending: 2 })
  expect(summarise([])).toEqual({ passed: 0, failed: 0, pending: 0 })
})

test('loads the branch, its PR and the unresolved threads', async () => {
  expect(await load(fake(WITH_PR))).toEqual({
    branch: 'feat/pull-to-refresh',
    isDirty: false,
    pr: {
      number: 128,
      title: PR.title,
      url: PR.url,
      state: 'draft',
      checks: { passed: 2, failed: 1, pending: 2 },
      checkRuns: [
        { name: 'App / test', result: 'failed', url: 'https://ci/test' },
        { name: 'App / deploy', result: 'pending', url: 'https://ci/deploy' },
        { name: 'ci/legacy', result: 'pending', url: 'https://legacy' },
        { name: 'App / lint', result: 'passed', url: 'https://ci/lint' },
        { name: 'App / docs', result: 'passed', url: 'https://ci/docs' },
      ],
      review: 'changes requested',
      threads: [
        {
          path: 'src/feed/useVideoPreloader.ts',
          line: 134,
          author: 'octocat',
          body: 'Should this guard against a missing ref?',
          url: `${PR.url}#src/feed/useVideoPreloader.ts`,
        },
        {
          path: 'src/services/group.ts',
          line: null,
          author: 'octocat',
          body: 'This doc is inaccurate.',
          url: `${PR.url}#src/services/group.ts`,
        },
      ],
    },
  })
  expect(await load(fake(NO_PR))).toEqual({ branch: 'feat/pull-to-refresh', isDirty: false, pr: null })
})

test('draws nothing on the default branch, a detached HEAD, outside a repo or when gh fails', async () => {
  const ran: string[] = []
  expect(await load(fake({ ...WITH_PR, 'git rev-parse --abbrev-ref': { stdout: 'master\n' } }, ran))).toBeNull()
  expect(ran).toEqual(['git rev-parse --abbrev-ref HEAD'])
  expect(await load(fake({ ...WITH_PR, 'git rev-parse --abbrev-ref': { stdout: 'HEAD\n' } }))).toBeNull()
  expect(await load(fake({ ...WITH_PR, 'git rev-parse --abbrev-ref': { exitCode: 128 } }))).toBeNull()
  expect(await load(fake({ ...WITH_PR, 'gh pr view': { exitCode: 1, stderr: 'HTTP 401: Bad credentials' } }))).toBeNull()
})

test('shows only the buttons that apply', async () => {
  const pr: PrBarPr = { number: 1, title: 't', url: 'u', state: 'open', checks: { passed: 1, failed: 0, pending: 0 }, checkRuns: [], review: '', threads: [] }
  const threads = [{ path: 'a.ts', line: 1, author: 'x', body: 'y', url: 'u' }]
  const keys = (snap: Parameters<typeof buttons>[0]) => buttons(snap).map(b => b.key)
  expect(keys({ branch: 'b', isDirty: false, pr: null })).toEqual(['commit'])
  expect(keys({ branch: 'b', isDirty: false, pr })).toEqual([])
  expect(keys({ branch: 'b', isDirty: true, pr })).toEqual(['commit'])
  expect(keys({ branch: 'b', isDirty: false, pr: { ...pr, threads, checks: { ...pr.checks, failed: 1 } } })).toEqual(['feedback', 'ci'])
  expect(keys({ branch: 'b', isDirty: false, pr: { ...pr, state: 'merged', threads } })).toEqual([])
})

test('the band shows the PR on one row and its buttons submit the prompts', async ($, on) => {
  const { sent, opened } = await start($, on, WITH_PR)
  expect(opened).toEqual([]) // the bar layout opens no panel by itself
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'pr-bar', surface, ...BAND })
    // One column, the pills over the buttons; every pill shares the bar's row.
    const boxes = await ui.findAll({ type: 'Box' })
    expect(boxes.filter(b => b.props.flexDirection === 'column')).toHaveLength(1)
    // The bar's row has its own background, the width of the band.
    expect(boxes.find(b => b.props.flexDirection === 'row')?.props).toMatchObject({
      backgroundColor: 'subtle',
      width: BAND.props.bodyColumns,
    })
    expect(await texts(ui)).toEqual([
      ' PR #128 · draft ',
      ' ✗ 1 failed ',
      ' 2 unresolved ',
      'changes requested',
      PR.title,
    ])
    expect(await ui.find({ type: 'Link', text: PR.title })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'commit' })).toBeUndefined()
    await ui.press({ key: 'feedback' })
    await ui.press({ key: 'ci' })
    await ui.unmount()
  }
  expect(sent).toEqual([
    "I've received feedback on PR #128. Check each unresolved review comment: is it correct and do we need to fix it?",
    'CI is failing on PR #128. Find out why and fix it.',
    "I've received feedback on PR #128. Check each unresolved review comment: is it correct and do we need to fix it?",
    'CI is failing on PR #128. Find out why and fix it.',
  ])
})

test('with no PR the band offers to open one', async ($, on) => {
  const { sent } = await start($, on, NO_PR)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'pr-bar', surface, ...BAND })
    expect(await texts(ui)).toEqual([' no PR ', 'feat/pull-to-refresh'])
    await ui.press({ key: 'commit' })
    await ui.unmount()
  }
  expect(sent).toEqual(['Commit the changes, push, and open a draft PR', 'Commit the changes, push, and open a draft PR'])
})

test('off a PR branch the band is left to the engine', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine band</Text>
  })
  await start($, on, { ...WITH_PR, 'git rev-parse --abbrev-ref': { stdout: 'master\n' } })
  const ui = await $.ui.mount({ plugin: 'pr-bar', surface: 'terminal', ...BAND })
  expect(await texts(ui)).toEqual(['engine band'])
})

test('/pr opens a panel listing the checks that are not green and the unresolved threads', async ($, on) => {
  const { sent, opened } = await start($, on, WITH_PR)
  expect(await $.command.run({ command: 'pr', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })).toMatchObject({ text: 'Pull request panel opened.' })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'pr-bar', surface, ...PANEL })
    expect(await texts(ui)).toEqual([
      ' PR #128 · draft ',
      ' ✗ 1 failed ',
      ' 2 unresolved ',
      PR.title,
      'feat/pull-to-refresh · changes requested',
      'Checks',
      '✗ App / test',
      '… App / deploy',
      '… ci/legacy',
      '✓ 2 passed',
      'Unresolved threads (2)',
      'src/feed/useVideoPreloader.ts:134 @octocat',
      ' @octocat',
      '  Should this guard against a missing ref?',
      'src/services/group.ts @octocat',
      ' @octocat',
      '  This doc is inaccurate.',
    ])
    expect(await ui.find({ type: 'Link', text: 'App / test' })).toBeDefined()
    await ui.press({ key: 'ci' })
    await ui.unmount()
  }
  expect(opened).toEqual(['pr (focused)'])
  expect(sent).toEqual(['CI is failing on PR #128. Find out why and fix it.', 'CI is failing on PR #128. Find out why and fix it.'])
})

const engineBand = (on: On) =>
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine band</Text>
  })

test('the panel layout opens the panel itself and leaves the band to the engine', { options: { layout: 'panel' } }, async ($, on) => {
  engineBand(on)
  const { opened } = await start($, on, WITH_PR)
  expect(opened).toEqual(['pr'])
  const ui = await $.ui.mount({ plugin: 'pr-bar', surface: 'terminal', ...BAND })
  expect(await texts(ui)).toEqual(['engine band'])
})

test('the panel layout opens nothing on the default branch', { options: { layout: 'panel' } }, async ($, on) => {
  engineBand(on)
  const { opened } = await start($, on, { ...WITH_PR, 'git rev-parse --abbrev-ref': { stdout: 'master\n' } })
  expect(opened).toEqual([])
})
