import Sequelize, { Model } from 'sequelize';
import bcrypt from 'bcryptjs';

class User extends Model {
  static init(sequelize) {
    super.init(
      {
        subscriber: Sequelize.BOOLEAN,
        first_name: Sequelize.STRING,
        last_name: Sequelize.STRING,
        user_name: Sequelize.STRING,
        password: Sequelize.VIRTUAL,
        password_hash: Sequelize.STRING,
        hint: Sequelize.STRING,
        phonenumber: Sequelize.STRING,
        email: Sequelize.STRING,
        birth_date: Sequelize.STRING,
        gender: Sequelize.STRING,
        bio: Sequelize.STRING(2200),
        instagram: Sequelize.STRING,
        linkedin: Sequelize.STRING,
        canceled_at: Sequelize.DATE,
        points: Sequelize.INTEGER,
        occupation: Sequelize.STRING,
        notification_token: Sequelize.STRING,
        flag_count: Sequelize.INTEGER,
        flagged_list: Sequelize.ARRAY(Sequelize.STRING),
        blocked_list: Sequelize.ARRAY(Sequelize.STRING),
        // contact_list: Sequelize.JSON,
        // deleted_phonenumber: Sequelize.STRING,
        // deleted_email: Sequelize.STRING,
      },
      {
        sequelize,
      }
    );
    this.addHook('beforeSave', async user => {
      if (user.password) {
        user.password_hash = await bcrypt.hash(user.password, 12);
      }
    });
    return this;
  }

  static associate(models) {
    this.belongsTo(models.File, { foreignKey: 'avatar_id', as: 'avatar' });
    // Self-referential follow graph (user -> user) via the user_followers join.
    this.belongsToMany(models.User, {
      as: 'following',
      through: 'user_followers',
      foreignKey: 'follower_id',
      otherKey: 'following_id',
    });
    this.belongsToMany(models.User, {
      as: 'followers',
      through: 'user_followers',
      foreignKey: 'following_id',
      otherKey: 'follower_id',
    });
  }

  checkPassword(password) {
    return bcrypt.compare(password, this.password_hash);
  }
}

export default User;
