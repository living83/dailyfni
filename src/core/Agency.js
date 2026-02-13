const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');

class Agency extends EventEmitter {
  constructor({ name, description = '', strategy = 'sequential' }) {
    super();
    this.id = uuidv4();
    this.name = name;
    this.description = description;
    this.strategy = strategy; // 'sequential' | 'parallel' | 'hierarchical'
    this.agents = [];
    this.tasks = [];
    this.status = 'idle'; // 'idle' | 'running' | 'completed' | 'failed'
    this.results = [];
    this.createdAt = new Date().toISOString();
  }

  addAgent(agent) {
    this.agents.push(agent);
    this.emit('agent:added', agent);
  }

  addTask(task) {
    this.tasks.push(task);
    this.emit('task:added', task);
  }

  async run() {
    this.status = 'running';
    this.results = [];
    this.emit('run:start', { agencyId: this.id });

    try {
      if (this.strategy === 'parallel') {
        await this._runParallel();
      } else {
        await this._runSequential();
      }
      this.status = 'completed';
      this.emit('run:complete', { agencyId: this.id, results: this.results });
    } catch (err) {
      this.status = 'failed';
      this.emit('run:error', { agencyId: this.id, error: err.message });
      throw err;
    }

    return this.results;
  }

  async _runSequential() {
    for (const task of this.tasks) {
      if (!task.agent) {
        const agent = this._selectAgent(task);
        if (agent) task.assignAgent(agent);
      }

      if (!task.agent) {
        task.fail('할당할 수 있는 에이전트가 없습니다.');
        this.results.push(task.toJSON());
        continue;
      }

      task.status = 'running';
      this.emit('task:start', task.toJSON());

      try {
        // 이전 태스크 결과를 컨텍스트로 전달
        task.context = this.results.slice();
        const result = await task.agent.execute(task);
        task.complete(result);
      } catch (err) {
        task.fail(err);
      }

      this.results.push(task.toJSON());
      this.emit('task:complete', task.toJSON());
    }
  }

  async _runParallel() {
    const promises = this.tasks.map(async (task) => {
      if (!task.agent) {
        const agent = this._selectAgent(task);
        if (agent) task.assignAgent(agent);
      }

      if (!task.agent) {
        task.fail('할당할 수 있는 에이전트가 없습니다.');
        return task.toJSON();
      }

      task.status = 'running';
      this.emit('task:start', task.toJSON());

      try {
        const result = await task.agent.execute(task);
        task.complete(result);
      } catch (err) {
        task.fail(err);
      }

      this.emit('task:complete', task.toJSON());
      return task.toJSON();
    });

    this.results = await Promise.all(promises);
  }

  _selectAgent(task) {
    // 라운드 로빈 방식으로 에이전트 선택
    if (this.agents.length === 0) return null;
    const idx = this.tasks.indexOf(task) % this.agents.length;
    return this.agents[idx];
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      strategy: this.strategy,
      status: this.status,
      agents: this.agents.map(a => a.toJSON()),
      tasks: this.tasks.map(t => t.toJSON()),
      results: this.results,
      createdAt: this.createdAt,
    };
  }
}

module.exports = Agency;
