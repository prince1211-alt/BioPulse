export const success = (res, data, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
};

export const error = (res, code, message, statusCode = 500) => {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message
    }
  });
};
