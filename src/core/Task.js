const { v4: uuidv4 } = require('uuid');

class Task {
  constructor({ description, expectedOutput = '', agent = null, context = [], priority = 'normal' }) {
    this.id = uuidv4();
    this.description = description;
    this.expectedOutput = expectedOutput;
    this.agent = agent;
    this.context = context; // 이전 태스크 결과를 참조
    this.priority = priority; // 'low' | 'normal' | 'high' | 'critical'
    this.status = 'pending'; // 'pending' | 'running' | 'completed' | 'failed'
    this.result = null;
    this.createdAt = new Date().toISOString();
    this.completedAt = null;
  }

  assignAgent(agent) {
    this.agent = agent;
  }

  complete(result) {
    this.status = 'completed';
    this.result = result;
    this.completedAt = new Date().toISOString();
  }

  fail(error) {
    this.status = 'failed';
    this.result = { error: error.message || error };
    this.completedAt = new Date().toISOString();
  }

  toJSON() {
    return {
      id: this.id,
      description: this.description,
      expectedOutput: this.expectedOutput,
      agentId: this.agent?.id || null,
      agentName: this.agent?.name || null,
      priority: this.priority,
      status: this.status,
      result: this.result,
      createdAt: this.createdAt,
      completedAt: this.completedAt,
    };
  }
}

module.exports = Task;
