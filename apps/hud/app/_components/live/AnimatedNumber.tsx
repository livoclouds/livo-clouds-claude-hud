'use client';

import { useEffect } from 'react';
import { motion, useReducedMotion, useSpring, useTransform } from 'motion/react';

export function AnimatedNumber({
  value,
  format,
}: {
  value: number;
  format: (n: number) => string;
}) {
  const reduceMotion = useReducedMotion();
  const spring = useSpring(value, { stiffness: 200, damping: 30 });
  const display = useTransform(spring, (latest) => format(latest));

  useEffect(() => {
    if (reduceMotion) {
      spring.jump(value);
    } else {
      spring.set(value);
    }
  }, [value, reduceMotion, spring]);

  if (reduceMotion) {
    return <span>{format(value)}</span>;
  }
  return <motion.span>{display}</motion.span>;
}
