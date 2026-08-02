const defaultAgentId = 'family-calendar'

export const agentShowcases = [
  {
    id: 'daily-brief',
    number: '01',
    status: 'Draft-only',
    icon: 'brief',
    title: 'Daily Work Brief',
    summary: 'Turns recent saved items and workspace context into a brief you can edit before saving.',
    runState: 'Draft ready',
    prompt: '“Turn recent saved items into a morning brief.”',
    steps: [
      {
        title: 'Find context',
        detail: 'Recent bookmarks, notes, and workspace items checked',
        state: 'complete'
      },
      {
        title: 'Draft the brief',
        detail: 'Priorities, loose ends, and source links prepared',
        state: 'complete'
      },
      {
        title: 'Wait for edits',
        detail: 'Nothing is saved or shared until you review',
        state: 'live'
      }
    ],
    review: {
      label: 'Draft ready',
      title: 'Review Daily Work Brief?',
      detail: '3 priorities · 2 loose ends · source links',
      action: 'Edit draft'
    }
  },
  {
    id: 'family-calendar',
    number: '02',
    status: 'Review once',
    icon: 'calendar',
    title: 'Family Calendar Assistant',
    summary: 'Finds family plans and school deadlines in a Gmail scan. After you approve the first run, matching Calendar events can be created automatically.',
    runState: 'First-run review',
    prompt: '“Check school emails each week for Calendar events.”',
    steps: [
      {
        title: 'Find context',
        detail: 'Gmail scan · 14 messages checked',
        state: 'complete'
      },
      {
        title: 'Draft the first run',
        detail: '2 Calendar event candidates prepared',
        state: 'complete'
      },
      {
        title: 'Approve automation',
        detail: 'Future matching events can be added automatically',
        state: 'live'
      }
    ],
    review: {
      label: 'First run ready',
      title: 'Approve recurring Calendar updates?',
      detail: 'Sports day · Term end · future school emails',
      action: 'Approve once'
    }
  },
  {
    id: 'grocery-planner',
    number: '03',
    status: 'Draft-only',
    icon: 'basket',
    title: 'Grocery Delivery Planner',
    summary: 'Turns a shopping list into Ocado and Tesco basket drafts. You review, sign in, and check out.',
    runState: 'Basket drafts',
    prompt: '“Turn this shopping list into basket drafts.”',
    steps: [
      {
        title: 'Read the list',
        detail: 'Milk, nappies, pasta, and apples parsed',
        state: 'complete'
      },
      {
        title: 'Match preferences',
        detail: 'Household staples and preferred shops applied',
        state: 'complete'
      },
      {
        title: 'Draft baskets',
        detail: 'Ocado and Tesco carts wait for checkout',
        state: 'live'
      }
    ],
    review: {
      label: 'Basket drafts ready',
      title: 'Review grocery baskets?',
      detail: 'Quantities · substitutions · checkout stays yours',
      action: 'Open drafts'
    }
  }
]

const htmlEscapes = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => htmlEscapes[char])
}

function findAgent(id) {
  return agentShowcases.find((agent) => agent.id === id) || agentShowcases.find((agent) => agent.id === defaultAgentId)
}

function getAgentIconHtml(icon) {
  const icons = {
    brief: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7.5 7.5h9M7.5 12h9M7.5 16.5h5" />
        <path d="M6 3.75h12A2.25 2.25 0 0 1 20.25 6v12A2.25 2.25 0 0 1 18 20.25H6A2.25 2.25 0 0 1 3.75 18V6A2.25 2.25 0 0 1 6 3.75Z" />
      </svg>
    `,
    calendar: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7.5 3.75v3M16.5 3.75v3M4.5 9h15" />
        <path d="M6.75 5.25h10.5A2.25 2.25 0 0 1 19.5 7.5v10.25A2.25 2.25 0 0 1 17.25 20H6.75a2.25 2.25 0 0 1-2.25-2.25V7.5a2.25 2.25 0 0 1 2.25-2.25Z" />
        <path d="m8.25 14.25 2.25 2.25 5-5" />
      </svg>
    `,
    basket: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m8 10 4-5 4 5" />
        <path d="M4.5 10h15l-1.25 8.25A2.25 2.25 0 0 1 16 20.25H8a2.25 2.25 0 0 1-2.25-2L4.5 10Z" />
        <path d="M9 14v2.75M12 14v2.75M15 14v2.75" />
      </svg>
    `
  }

  return icons[icon] || icons.brief
}

function getAgentRunHtml(agent) {
  const steps = agent.steps.map((step, index) => {
    const stateClass = step.state === 'live' ? 'is-live' : 'is-complete'
    const marker = step.state === 'live'
      ? '<span class="agent-wait" aria-hidden="true"></span>'
      : '<span class="agent-check" aria-hidden="true">✓</span>'

    return `
      <li class="agent-step ${stateClass}">
        <span class="agent-step-icon" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
        <span><strong>${escapeHtml(step.title)}</strong><small>${escapeHtml(step.detail)}</small></span>
        ${marker}
      </li>
    `
  }).join('')

  return `
    <div class="agent-run" id="agent-result" aria-label="${escapeHtml(agent.title)} result" aria-live="polite">
      <div class="agent-run-bar">
        <span class="agent-run-title"><i class="agent-live-dot"></i>Agent run</span>
        <span class="agent-run-state">${escapeHtml(agent.runState)}</span>
      </div>

      <div class="agent-prompt">
        <span class="agent-avatar">K</span>
        <div>
          <small>You asked</small>
          <p>${escapeHtml(agent.prompt)}</p>
        </div>
      </div>

      <ol class="agent-timeline">
        ${steps}
      </ol>

      <div class="agent-review-card">
        <div>
          <span class="agent-review-label">${escapeHtml(agent.review.label)}</span>
          <strong>${escapeHtml(agent.review.title)}</strong>
          <small>${escapeHtml(agent.review.detail)}</small>
        </div>
        <span class="agent-review-action">${escapeHtml(agent.review.action)} <i aria-hidden="true">→</i></span>
      </div>

      <img class="agent-squirrel" src="/squirrel-mascot-pointing.png" alt="" aria-hidden="true" width="512"
        height="512" loading="lazy" decoding="async" />
    </div>
  `
}

function getAgentCatalogHtml(activeId) {
  const cards = agentShowcases.map((agent) => {
    const active = agent.id === activeId
    return `
      <button class="agent-card${active ? ' is-active' : ''}" type="button" data-agent-id="${escapeHtml(agent.id)}"
        aria-pressed="${String(active)}" aria-controls="agent-result">
        <span class="agent-card-top">
          <span class="agent-card-number">${escapeHtml(agent.number)}</span>
          <span class="agent-status">${escapeHtml(agent.status)}</span>
        </span>
        <span class="agent-card-icon" aria-hidden="true">${getAgentIconHtml(agent.icon)}</span>
        <span class="agent-card-title">${escapeHtml(agent.title)}</span>
        <span class="agent-card-copy">${escapeHtml(agent.summary)}</span>
      </button>
    `
  }).join('')

  return `<div class="agent-catalog" aria-label="Built-in Kobi agents">${cards}</div>`
}

export function getAgentShowcaseHtml(activeId = defaultAgentId) {
  const activeAgent = findAgent(activeId)
  return `${getAgentRunHtml(activeAgent)}${getAgentCatalogHtml(activeAgent.id)}`
}

export function initAgentShowcase(root = document.querySelector('[data-agent-showcase]')) {
  if (!(root instanceof HTMLElement)) return

  let activeId = root.getAttribute('data-initial-agent') || defaultAgentId

  const render = () => {
    root.innerHTML = getAgentShowcaseHtml(activeId)
  }

  root.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null
    const card = target?.closest('[data-agent-id]')
    if (!(card instanceof HTMLButtonElement)) return

    const nextId = card.getAttribute('data-agent-id') || defaultAgentId
    if (nextId === activeId) return

    activeId = nextId
    render()

    const activeCard = Array.from(root.querySelectorAll('[data-agent-id]'))
      .find((node) => node.getAttribute('data-agent-id') === activeId)
    if (activeCard instanceof HTMLButtonElement) activeCard.focus({ preventScroll: true })
  })

  render()
}
