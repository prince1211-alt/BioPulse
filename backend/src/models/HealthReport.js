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
    },
    content_type: {
      type: String,
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
      enum: ['pending', 'processing', 'done', 'failed'],
      default: 'pending',
    },
    extracted_data: {
      type: mongoose.Schema.Types.Mixed,
    },
    raw_text: {
      type: String,
    },
    extraction_confidence: {
      type: Number,
    },
    analysis_status: {
      type: String,
      enum: ['pending', 'processing', 'done', 'failed'],
      default: 'pending',
    },
    ai_summary: {
      type: String,
      maxlength: 50000,
    },
    ai_insights: {
      type: mongoose.Schema.Types.Mixed,
    },
    ai_flags: {
      type: mongoose.Schema.Types.Mixed,
    },
    ai_recommendations: {
      type: mongoose.Schema.Types.Mixed,
    },
    risk_score: {
      type: Number,
      min: 0,
      max: 100,
    },
    risk_label: {
      type: String,
      enum: ['minimal', 'low', 'moderate', 'high', 'critical'],
    },
    trends: {
      type: mongoose.Schema.Types.Mixed,
    },
    error_message: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

export const HealthReport = mongoose.model('HealthReport', healthReportSchema);