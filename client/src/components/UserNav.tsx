import { useState } from "react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@radix-ui/react-dropdown-menu";
import { User, Settings, Moon, Sun, Sparkles, Loader2 } from "lucide-react";
import { useTheme } from "../hooks/use-theme";
import { useUserProfile } from "../contexts/UserProfileContext";
import { TaskManager } from "./TaskManager";
import "./UserNav.css";

export function UserNav() {
    const { theme, toggleTheme } = useTheme();
    const { userProfile, analyzingProfile, handleAnalyzeProfile } = useUserProfile();
    const [showTaskManager, setShowTaskManager] = useState(false);

    return (
        <>
            <div className="user-nav-container">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="user-avatar-btn" aria-label="User Menu">
                            <User className="user-icon" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="user-dropdown-content" align="end" sideOffset={10}>
                        <DropdownMenuLabel className="user-dropdown-label">
                            <div className="flex flex-col">
                                <p className="user-label-title">{userProfile?.display_card.title || '个人用户'}</p>
                                <p className="user-label-subtitle">
                                    {userProfile ? 'AI Profile Active' : 'User Profile'}
                                </p>
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator className="user-dropdown-separator" />

                        <DropdownMenuItem
                            className="user-dropdown-item"
                            onSelect={(e) => {
                                e.preventDefault();
                                handleAnalyzeProfile();
                            }}
                            disabled={analyzingProfile}
                        >
                            {analyzingProfile ? (
                                <Loader2 className="item-icon animate-spin" />
                            ) : (
                                <Sparkles className="item-icon text-indigo-400" />
                            )}
                            <span>{userProfile ? '更新用户画像' : '生成用户画像'}</span>
                        </DropdownMenuItem>

                        <DropdownMenuItem
                            className="user-dropdown-item"
                            onSelect={(e) => {
                                e.preventDefault();
                                setShowTaskManager(true);
                            }}
                        >
                            <Settings className="item-icon" />
                            <span>任务管理</span>
                        </DropdownMenuItem>

                        <DropdownMenuSeparator className="user-dropdown-separator" />

                        <DropdownMenuItem
                            className="user-dropdown-item"
                            onSelect={(e) => {
                                e.preventDefault();
                                toggleTheme();
                            }}
                        >
                            {theme === 'dark' ? (
                                <>
                                    <Sun className="item-icon" />
                                    <span>切换亮色模式</span>
                                </>
                            ) : (
                                <>
                                    <Moon className="item-icon" />
                                    <span>切换暗色模式</span>
                                </>
                            )}
                        </DropdownMenuItem>

                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Task Manager Modal */}
            {showTaskManager && (
                <div className="task-manager-overlay" onClick={() => setShowTaskManager(false)}>
                    <div className="task-manager-modal" onClick={e => e.stopPropagation()}>
                        <TaskManager onClose={() => setShowTaskManager(false)} />
                    </div>
                </div>
            )}
        </>
    );
}
