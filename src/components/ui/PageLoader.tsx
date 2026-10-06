import { motion } from 'framer-motion';

export const PageLoader = () => {
  return (
    <div className="flex flex-col items-center justify-center w-full h-full min-h-[60vh]">
      {/* Animated logo mark */}
      <motion.div
        className="relative mb-6"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        {/* Outer spinning ring */}
        <motion.div
          className="w-16 h-16 rounded-full border-4 border-orange-100"
          style={{ borderTopColor: '#f97316' }}
          animate={{ rotate: 360 }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
        />
        {/* Inner BE logo mark */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-be-orange to-orange-600 flex items-center justify-center shadow-lg">
            <span className="text-white font-black text-xs tracking-tight">BE</span>
          </div>
        </div>
      </motion.div>

      {/* Loading text with animated dots */}
      <motion.div
        className="flex items-center gap-1"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.3 }}
      >
        <span className="text-sm font-semibold text-gray-400">Loading</span>
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="w-1 h-1 rounded-full bg-be-orange"
            animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
            transition={{
              duration: 1,
              repeat: Infinity,
              delay: i * 0.2,
              ease: 'easeInOut',
            }}
          />
        ))}
      </motion.div>

      {/* Skeleton shimmer bars */}
      <motion.div
        className="mt-8 w-full max-w-sm space-y-3 px-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.4 }}
      >
        {[80, 60, 72, 50].map((w, i) => (
          <div
            key={i}
            className="h-3 rounded-full bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-pulse"
            style={{ width: `${w}%` }}
          />
        ))}
      </motion.div>
    </div>
  );
};
