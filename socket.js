const Message = require('./models/Message');
const jwt = require('jsonwebtoken');

module.exports = (io) => {
  // Auth middleware for socket
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.userId}`);
    socket.join(socket.userId); // Each user joins their own room

    socket.on('send_message', async ({ to, content, applicationId }) => {
      try {
        const message = await Message.create({
          sender: socket.userId,
          receiver: to,
          content,
          application: applicationId,
        });

        const populated = await message.populate('sender', 'name avatar');

        // Send to receiver
        io.to(to).emit('receive_message', populated);
        // Confirm to sender
        socket.emit('message_sent', populated);
      } catch (err) {
        socket.emit('message_error', { message: err.message });
      }
    });

    socket.on('get_messages', async ({ withUser, applicationId }) => {
      try {
        const query = {
          $or: [
            { sender: socket.userId, receiver: withUser },
            { sender: withUser, receiver: socket.userId },
          ],
        };
        if (applicationId) query.application = applicationId;

        const messages = await Message.find(query)
          .populate('sender', 'name avatar')
          .sort('createdAt')
          .lean();

        // Mark as read
        await Message.updateMany({ sender: withUser, receiver: socket.userId, read: false }, { read: true });

        socket.emit('messages_loaded', messages);
      } catch (err) {
        socket.emit('message_error', { message: err.message });
      }
    });

    socket.on('mark_read', async ({ from }) => {
      await Message.updateMany({ sender: from, receiver: socket.userId, read: false }, { read: true });
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.userId}`);
    });
  });
};
