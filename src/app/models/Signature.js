import Sequelize, { Model } from 'sequelize';

class Signature extends Model {
  static init(sequelize) {
    super.init(
      {
        name: Sequelize.STRING,
        path: Sequelize.STRING,
        url: {
          type: Sequelize.VIRTUAL,
          get() {
            // Same private-bucket situation as File: stream through the public
            // proxy. Signatures live in the same S3 bucket, so /files/raw works.
            if (!this.name) return this.path;
            return `${process.env.APP_URL || ''}/files/raw/${encodeURIComponent(
              this.name
            )}`;
          },
        },
      },
      {
        sequelize,
      }
    );
    return this;
  }
}
export default Signature;
