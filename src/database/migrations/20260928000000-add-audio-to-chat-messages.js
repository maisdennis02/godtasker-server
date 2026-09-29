// Voice messages: a chat message can carry an uploaded audio file instead of
// text. `body` becomes nullable — a voice note has no text.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('chat_messages', 'file_id', {
      type: Sequelize.INTEGER,
      references: { model: 'files', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      allowNull: true,
    });
    await queryInterface.addColumn('chat_messages', 'duration_ms', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.changeColumn('chat_messages', 'body', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.query(
      "UPDATE chat_messages SET body = '' WHERE body IS NULL"
    );
    await queryInterface.changeColumn('chat_messages', 'body', {
      type: Sequelize.TEXT,
      allowNull: false,
    });
    await queryInterface.removeColumn('chat_messages', 'duration_ms');
    await queryInterface.removeColumn('chat_messages', 'file_id');
  },
};
