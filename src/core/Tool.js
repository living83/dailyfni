const { v4: uuidv4 } = require('uuid');

class Tool {
  constructor({ name, description, parameters = {} }) {
    this.id = uuidv4();
    this.name = name;
    this.description = description;
    this.parameters = parameters;
  }

  async execute(input) {
    throw new Error(`Tool "${this.name}"의 execute() 메서드를 구현해야 합니다.`);
  }

  toSchema() {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters,
    };
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
    };
  }
}

module.exports = Tool;
