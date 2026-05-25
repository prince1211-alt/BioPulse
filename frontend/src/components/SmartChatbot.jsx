import React, { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { MessageCircle, X, Send, Sparkles, Bot, Loader2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { chatApi } from '../api/chat.api';
import { useAuthStore } from '../stores/authStore';
import { Button } from './ui/Button';

// Simple custom formatter for markdown-like text
function formatMessage(text) {
  if (!text) return '';
  
  // Format bold
  let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Format bullet points
  const lines = formatted.split('\n');
  const processedLines = lines.map(line => {
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      return `<li class="ml-4 list-disc my-1">${line.trim().substring(2)}</li>`;
    }
    return line;
  });
  
  formatted = processedLines.join('\n');
  
  // Wrap consecutive <li> in <ul>
  formatted = formatted.replace(/(<li.*<\/li>)/gs, '<ul class="my-2">$1</ul>');
  
  // Convert newlines to breaks (ignoring list items)
  formatted = formatted.split('\n').map(line => {
    if (line.includes('<li') || line.includes('<ul') || line.includes('</ul')) return line;
    return line + '<br/>';
  }).join('');
  
  return <div className="space-y-1 text-sm text-foreground/90 leading-relaxed" dangerouslySetInnerHTML={{ __html: formatted }} />;
}

export function SmartChatbot() {
  const { isLoggedIn, user } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Hello! I am your BioPulse AI Assistant. How can I help you today?`,
      time: new Date()
    }
  ]);
  const messagesEndRef = useRef(null);

  // Auto-scroll
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const chatMutation = useMutation({
    mutationFn: (data) => chatApi.healthChat(data).then(res => res.data?.data || res.data),
    onSuccess: (data) => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.reply,
        time: new Date()
      }]);
    },
    onError: (err) => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Sorry, I encountered an error: ${err.message || 'Server error'}. Please try again.`,
        time: new Date(),
        isError: true
      }]);
    }
  });

  if (!isLoggedIn || !user) return null;

  const handleSend = (e) => {
    if (e) e.preventDefault();
    if (!input.trim() || chatMutation.isPending) return;

    const userMessage = input.trim();
    setInput('');
    
    // Append user message
    setMessages(prev => [...prev, { role: 'user', content: userMessage, time: new Date() }]);

    // Prepare history (limit to last 10 messages for context window efficiency)
    const history = messages
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }));

    chatMutation.mutate({ message: userMessage, history });
  };

  const handleQuickAction = (text) => {
    setInput(text);
    // Submit in next tick
    setTimeout(() => {
      setInput('');
      setMessages(prev => [...prev, { role: 'user', content: text, time: new Date() }]);
      const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));
      chatMutation.mutate({ message: text, history });
    }, 100);
  };

  const quickActions = [
    "Explain my health report risk status",
    "What foods should I avoid?",
    "Help me design a morning workout routine",
    "What are common symptoms of thyroid issues?"
  ];

  return (
    <div className="fixed bottom-20 right-6 md:bottom-6 md:right-6 z-50 flex flex-col items-end">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="w-[90vw] sm:w-[400px] h-[550px] bg-background border shadow-2xl rounded-2xl flex flex-col overflow-hidden mb-4 mr-0 md:mr-2"
          >
            {/* Header */}
            <div className="p-4 bg-gradient-to-r from-primary to-indigo-600 text-primary-foreground flex justify-between items-center shadow-md">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
                  <Sparkles size={18} className="text-white" />
                </div>
                <div>
                  <h4 className="font-bold text-sm leading-tight flex items-center gap-1.5">
                    BioPulse AI Assistant <span className="h-2 w-2 bg-emerald-400 rounded-full"></span>
                  </h4>
                  <p className="text-[10px] text-white/80">Personalized Health Queries</p>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-full hover:bg-white/25 transition-colors text-white"
              >
                <X size={18} />
              </button>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/20">
              {messages.map((m, idx) => {
                const isAssistant = m.role === 'assistant';
                return (
                  <div 
                    key={idx} 
                    className={`flex gap-2.5 max-w-[85%] ${isAssistant ? 'mr-auto' : 'ml-auto flex-row-reverse'}`}
                  >
                    {isAssistant && (
                      <div className="h-7 w-7 rounded-full bg-indigo-50 border flex items-center justify-center shrink-0">
                        <Bot size={14} className="text-indigo-600" />
                      </div>
                    )}
                    <div 
                      className={`p-3.5 rounded-2xl text-sm ${
                        isAssistant 
                          ? m.isError 
                            ? 'bg-destructive/10 border border-destructive/20 text-destructive' 
                            : 'bg-card text-foreground border shadow-sm rounded-tl-none' 
                          : 'bg-primary text-primary-foreground rounded-tr-none'
                      }`}
                    >
                      {isAssistant ? formatMessage(m.content) : <p>{m.content}</p>}
                      <p className={`text-[9px] mt-1.5 text-right ${isAssistant ? 'text-muted-foreground' : 'text-primary-foreground/75'}`}>
                        {new Date(m.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                );
              })}
              {chatMutation.isPending && (
                <div className="flex gap-2.5 max-w-[85%] mr-auto">
                  <div className="h-7 w-7 rounded-full bg-indigo-50 border flex items-center justify-center shrink-0">
                    <Bot size={14} className="text-indigo-600" />
                  </div>
                  <div className="bg-card text-foreground border shadow-sm rounded-2xl rounded-tl-none p-3.5 flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin text-indigo-600" />
                    <span className="text-xs text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Actions (when input is empty and not loading) */}
            {messages.length === 1 && !chatMutation.isPending && (
              <div className="p-3 border-t bg-muted/10">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                  Suggested Queries
                </p>
                <div className="flex flex-col gap-1.5">
                  {quickActions.map((qa, i) => (
                    <button
                      key={i}
                      onClick={() => handleQuickAction(qa)}
                      className="text-left text-xs bg-card hover:bg-muted border p-2 rounded-lg transition-colors text-foreground font-medium flex items-center justify-between group"
                    >
                      <span>{qa}</span>
                      <Sparkles size={11} className="text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSend} className="p-3 border-t flex gap-2 items-center bg-card shrink-0">
              <input
                type="text"
                placeholder="Ask me anything about your health..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={chatMutation.isPending}
                className="flex-1 bg-muted px-4 py-2.5 rounded-xl text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary border-none"
              />
              <Button 
                type="submit" 
                size="icon" 
                disabled={!input.trim() || chatMutation.isPending}
                className="rounded-xl shrink-0"
              >
                <Send size={15} />
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Toggle Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="h-14 w-14 rounded-full bg-gradient-to-r from-primary to-indigo-600 text-white flex items-center justify-center shadow-xl hover:shadow-primary/30 transition-shadow relative border border-white/10"
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <X size={22} />
            </motion.div>
          ) : (
            <motion.div
              key="chat"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-center justify-center relative"
            >
              <MessageCircle size={22} />
              <span className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 rounded-full bg-emerald-400 border-2 border-primary flex items-center justify-center animate-bounce" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
