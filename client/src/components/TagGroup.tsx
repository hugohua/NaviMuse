import React from 'react';
import { motion, type Variants } from 'framer-motion';
import type { TagCategory } from '../types';
import { cn } from '../utils/cn';
import './TagGroup.css';

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
        return <div className="tag-loading">Loading tags...</div>;
    }

    return (
        <motion.div
            className="tag-group"
            initial="hidden"
            animate="visible"
            variants={containerVariants}
        >
            {categories.map((cat) => (
                <motion.div
                    key={cat.title}
                    className="tag-category"
                    variants={categoryVariants}
                >
                    <div className="category-title">{cat.title}</div>
                    <motion.div
                        className="tag-list"
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
                                    className={cn("tag-item", isSelected && "tag-item-selected")}
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
