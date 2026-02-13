const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');
const Task = require('./Task');

const PRIORITY_WEIGHT = { urgent: 4, high: 3, normal: 2, low: 1 };

class Planner extends EventEmitter {
  constructor({ name, description = '' }) {
    super();
    this.id = uuidv4();
    this.name = name;
    this.description = description;
    this.agents = [];    // 사용 가능한 에이전트 풀
    this.plans = [];     // 생성된 일일 계획 이력
    this.createdAt = new Date().toISOString();
  }

  // --- 에이전트 풀 관리 ---

  registerAgent(agent) {
    this.agents.push(agent);
    this.emit('agent:registered', agent.toJSON());
  }

  getAgentByRole(role) {
    return this.agents.find(a => a.role === role) || null;
  }

  // --- 일일 계획 수립 ---

  createDailyPlan({ products, workflowSteps }) {
    const today = new Date().toISOString().split('T')[0];

    // 1단계: 오늘 다룰 상품 선정 (우선순위 + 마지막 처리 시간 기준)
    const selectedProducts = this._selectProducts(products);

    // 2단계: 상품별 작업 스케줄 생성
    const schedule = this._buildSchedule(selectedProducts, workflowSteps);

    const plan = {
      id: uuidv4(),
      date: today,
      plannerId: this.id,
      selectedProducts: selectedProducts.map(p => p.toJSON()),
      schedule,
      status: 'planned', // 'planned' | 'running' | 'completed' | 'failed'
      createdAt: new Date().toISOString(),
      completedAt: null,
      results: [],
    };

    this.plans.push(plan);
    this.emit('plan:created', plan);
    return plan;
  }

  // 우선순위 + 오래된 순으로 상품 선정
  _selectProducts(products, maxCount = 5) {
    const active = products.filter(p => p.status === 'active');

    return active
      .sort((a, b) => {
        // 1차: 우선순위 높은 순
        const weightDiff = (PRIORITY_WEIGHT[b.priority] || 2) - (PRIORITY_WEIGHT[a.priority] || 2);
        if (weightDiff !== 0) return weightDiff;

        // 2차: 마지막 처리 시간이 오래된 순 (null이면 최우선)
        if (!a.lastHandledAt) return -1;
        if (!b.lastHandledAt) return 1;
        return new Date(a.lastHandledAt) - new Date(b.lastHandledAt);
      })
      .slice(0, maxCount);
  }

  // 상품별 워크플로우 스텝에 따른 스케줄 생성
  _buildSchedule(products, workflowSteps) {
    const schedule = [];
    let order = 1;
    const startHour = 9; // 오전 9시 시작

    for (const product of products) {
      const productTasks = [];

      for (let i = 0; i < workflowSteps.length; i++) {
        const step = workflowSteps[i];
        const agent = this._assignAgent(step);
        const scheduledHour = startHour + Math.floor((order - 1) * 0.5);
        const scheduledMin = ((order - 1) % 2) * 30;

        const entry = {
          order,
          productId: product.id,
          productName: product.name,
          step: step.name,
          description: `[${product.name}] ${step.description}`,
          assignedAgent: agent ? { id: agent.id, name: agent.name, role: agent.role } : null,
          scheduledTime: `${String(scheduledHour).padStart(2, '0')}:${String(scheduledMin).padStart(2, '0')}`,
          estimatedMinutes: step.estimatedMinutes || 30,
          dependsOn: step.dependsOn || [],
          status: 'scheduled',
        };

        productTasks.push(entry);
        order++;
      }

      schedule.push({
        productId: product.id,
        productName: product.name,
        category: product.category,
        priority: product.priority,
        tasks: productTasks,
      });
    }

    return schedule;
  }

  // 스텝의 requiredRole에 맞는 에이전트 배정
  _assignAgent(step) {
    if (step.requiredRole) {
      return this.getAgentByRole(step.requiredRole);
    }
    // 역할 지정이 없으면 라운드 로빈
    if (this.agents.length === 0) return null;
    return this.agents[Math.floor(Math.random() * this.agents.length)];
  }

  // --- 계획 실행 ---

  async executePlan(planId, agency) {
    const plan = this.plans.find(p => p.id === planId);
    if (!plan) throw new Error('계획을 찾을 수 없습니다.');
    if (plan.status === 'running') throw new Error('이미 실행 중인 계획입니다.');

    plan.status = 'running';
    this.emit('plan:start', { planId });

    try {
      for (const productSchedule of plan.schedule) {
        this.emit('product:start', {
          planId,
          productId: productSchedule.productId,
          productName: productSchedule.productName,
        });

        for (const entry of productSchedule.tasks) {
          entry.status = 'running';
          this.emit('task:start', entry);

          // 에이전트가 배정된 경우 Task 생성 후 실행
          const agent = entry.assignedAgent
            ? this.agents.find(a => a.id === entry.assignedAgent.id)
            : null;

          const task = new Task({
            description: entry.description,
            expectedOutput: entry.step,
            agent,
            priority: productSchedule.priority,
          });

          if (agent) {
            try {
              const result = await agent.execute(task);
              task.complete(result);
              entry.status = 'completed';
              entry.result = result;
            } catch (err) {
              task.fail(err);
              entry.status = 'failed';
              entry.result = { error: err.message };
            }
          } else {
            entry.status = 'skipped';
            entry.result = { reason: '배정된 에이전트가 없습니다.' };
          }

          plan.results.push({ ...entry });
          this.emit('task:complete', entry);
        }

        this.emit('product:complete', {
          planId,
          productId: productSchedule.productId,
        });
      }

      plan.status = 'completed';
      plan.completedAt = new Date().toISOString();
      this.emit('plan:complete', { planId, results: plan.results });
    } catch (err) {
      plan.status = 'failed';
      this.emit('plan:error', { planId, error: err.message });
      throw err;
    }

    return plan;
  }

  // --- 조회 ---

  getLatestPlan() {
    return this.plans[this.plans.length - 1] || null;
  }

  getPlan(planId) {
    return this.plans.find(p => p.id === planId) || null;
  }

  getSummary() {
    const latest = this.getLatestPlan();
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      agentCount: this.agents.length,
      agents: this.agents.map(a => ({ id: a.id, name: a.name, role: a.role })),
      totalPlans: this.plans.length,
      latestPlan: latest ? {
        id: latest.id,
        date: latest.date,
        status: latest.status,
        productCount: latest.selectedProducts.length,
        taskCount: latest.schedule.reduce((sum, s) => sum + s.tasks.length, 0),
      } : null,
      createdAt: this.createdAt,
    };
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      agents: this.agents.map(a => a.toJSON()),
      plans: this.plans,
      createdAt: this.createdAt,
    };
  }
}

module.exports = Planner;
