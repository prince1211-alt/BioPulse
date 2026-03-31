import mongoose from 'mongoose';

const healthReportSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    file_url: {
      type: String,
      required: true,
    },
    file_type: {
      type: String,
      required: true,
    },
    report_type: {
      type: String,
      required: true,
    },
    report_date: {
      type: Date,
      default: Date.now,
    },
    ocr_status: {
      type: String,
      enum: ['pending', 'done', 'failed'],
      default: 'pending',
    },
    extracted_data: {
      type: mongoose.Schema.Types.Mixed,
    },
    analysis_status: {
      type: String,
      enum: ['pending', 'done', 'failed'],
      default: 'pending',
    },
    ai_summary: {
      type: String,
      maxlength:2000
    },
    ai_flags: {
      type: mongoose.Schema.Types.Mixed,
    },
    ai_recommendations: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

export const HealthReport = mongoose.model('HealthReport', healthReportSchema);