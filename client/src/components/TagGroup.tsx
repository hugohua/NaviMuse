import React from 'react';
import { motion, type Variants } from 'framer-motion';
import type { TagCategory } from '../types';
import { cn } from '../utils/cn';

interface Props {
    categories: TagCategory[];
    selectedTags: Set<string>;
    onToggle: (tag: string) => void;
}

const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.05,
        },
    },
};

const itemVariants: Variants = {
    hidden: { opacity: 0, y: 10, scale: 0.95 },
    visible: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { type: "spring" as const, stiffness: 300, damping: 24 },
    },
};

const categoryVariants: Variants = {
    hidden: { opacity: 0, x: -20 },
    visible: {
        opacity: 1,
        x: 0,
        transition: { type: "spring" as const, stiffness: 200, damping: 20 },
    },
};

export const TagGroup: React.FC<Props> = ({ categories, selectedTags, onToggle }) => {
    if (categories.length === 0) {
        return <div className="p-4 text-center text-sm text-primary/50 animate-pulse">Loading tags...</div>;
    }

    return (
        <motion.div
            className="space-y-6"
            initial="hidden"
            animate="visible"
            variants={containerVariants}
        >
            {categories.map((cat) => (
                <motion.div
                    key={cat.title}
                    className="space-y-3"
                    variants={categoryVariants}
                >
                    <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{cat.title}</div>
                    <motion.div
                        className="flex flex-wrap gap-2"
                        variants={containerVariants}
                    >
                        {Object.keys(cat.attributes).map((tag) => {
                            const isSelected = selectedTags.has(tag);
                            return (
                                <motion.div
                                    key={tag}
                                    variants={itemVariants}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    className={cn(
                                        "px-3 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer select-none border backdrop-blur-sm",
                                        isSelected
                                            ? "bg-primary text-primary-foreground border-primary shadow-[0_0_12px_rgba(99,102,241,0.4)]"
                                            : "bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10 hover:border-white/20 hover:text-foreground"
                                    )}
                                    onClick={() => onToggle(tag)}
                                >
                                    {tag}
                                </motion.div>
                            );
                        })}
                    </motion.div>
                </motion.div>
            ))}
        </motion.div>
    );
};
