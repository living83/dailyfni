const { v4: uuidv4 } = require('uuid');

class Agent {
  constructor({ name, role, goal, backstory = '', tools = [], model = 'default' }) {
    this.id = uuidv4();
    this.name = name;
    this.role = role;
    this.goal = goal;
    this.backstory = backstory;
    this.tools = tools;
    this.model = model;
    this.memory = [];
    this.createdAt = new Date().toISOString();
  }

  addTool(tool) {
    this.tools.push(tool);
  }

  addMemory(entry) {
    this.memory.push({
      timestamp: new Date().toISOString(),
      ...entry,
    });
  }

  getSystemPrompt() {
    let prompt = `당신은 "${this.role}" 역할의 AI 에이전트입니다.\n`;
    prompt += `이름: ${this.name}\n`;
    prompt += `목표: ${this.goal}\n`;
    if (this.backstory) {
      prompt += `배경: ${this.backstory}\n`;
    }
    if (this.tools.length > 0) {
      prompt += `\n사용 가능한 도구:\n`;
      this.tools.forEach(tool => {
        prompt += `- ${tool.name}: ${tool.description}\n`;
      });
    }
    return prompt;
  }

  async execute(task) {
    this.addMemory({ type: 'task_start', task: task.description });

    // 실제 LLM 호출은 Agency에서 처리
    const result = {
      agentId: this.id,
      agentName: this.name,
      taskId: task.id,
      status: 'completed',
      output: `[${this.name}] "${task.description}" 작업을 처리했습니다.`,
      timestamp: new Date().toISOString(),
    };

    this.addMemory({ type: 'task_complete', result: result.output });
    return result;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      goal: this.goal,
      backstory: this.backstory,
      tools: this.tools.map(t => t.toJSON()),
      model: this.model,
      memorySize: this.memory.length,
      createdAt: this.createdAt,
    };
  }
}

module.exports = Agent;
