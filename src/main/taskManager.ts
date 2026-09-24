import { TaskStatus, TaskStep } from '../shared/types'
import { AutomationEngine } from './automation'

interface CardState {
  id: string
  status: TaskStatus
  engine: AutomationEngine | null
}

export class TaskManager {
  private cards: Map<string, CardState> = new Map()
  private statusListeners: Array<(cardId: string, status: TaskStatus) => void> = []

  onStatusChange(cb: (cardId: string, status: TaskStatus) => void) {
    this.statusListeners.push(cb)
  }

  registerCard(cardId: string) {
    if (!this.cards.has(cardId)) {
      this.cards.set(cardId, { id: cardId, status: TaskStatus.IDLE, engine: null })
    }
  }

  unregisterCard(cardId: string) {
    this.stop(cardId)
    this.cards.delete(cardId)
  }

  registerCards(cardIds: string[]) {
    cardIds.forEach(id => this.registerCard(id))
  }

  private setStatus(cardId: string, status: TaskStatus) {
    const card = this.cards.get(cardId)
    if (card) {
      card.status = status
      this.statusListeners.forEach(cb => cb(cardId, status))
    }
  }

  async start(cardId: string, steps?: TaskStep[]) {
    const card = this.cards.get(cardId)
    if (!card) {
      this.registerCard(cardId)
    }
    const cardState = this.cards.get(cardId)!
    if (cardState.status === TaskStatus.RUNNING) return

    if (cardState.status === TaskStatus.PAUSED) {
      cardState.engine?.resume()
      this.setStatus(cardId, TaskStatus.RUNNING)
      return
    }

    cardState.engine = new AutomationEngine(cardId, () => {
      this.setStatus(cardId, TaskStatus.STOPPED)
      setTimeout(() => this.setStatus(cardId, TaskStatus.IDLE), 500)
    })

    if (steps && steps.length > 0) {
      cardState.engine.setSteps(steps)
    }

    this.setStatus(cardId, TaskStatus.RUNNING)
    cardState.engine.start()
  }

  pause(cardId: string) {
    const card = this.cards.get(cardId)
    if (card?.status === TaskStatus.RUNNING) {
      card.engine?.pause()
      this.setStatus(cardId, TaskStatus.PAUSED)
    }
  }

  stop(cardId: string) {
    const card = this.cards.get(cardId)
    if (card && card.status !== TaskStatus.IDLE) {
      card.engine?.stop()
      this.setStatus(cardId, TaskStatus.STOPPED)
      setTimeout(() => this.setStatus(cardId, TaskStatus.IDLE), 500)
    }
  }

  startAll() {
    this.cards.forEach((_, id) => this.start(id))
  }

  pauseAll() {
    this.cards.forEach((_, id) => this.pause(id))
  }

  stopAll() {
    this.cards.forEach((_, id) => this.stop(id))
  }

  getStatus(cardId: string): TaskStatus {
    return this.cards.get(cardId)?.status ?? TaskStatus.IDLE
  }

  getAllStatuses(): Record<string, TaskStatus> {
    const result: Record<string, TaskStatus> = {}
    this.cards.forEach((card, id) => { result[id] = card.status })
    return result
  }
}