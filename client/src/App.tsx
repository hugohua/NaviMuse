import { useState, useEffect } from 'react';
import { AudioPlayerProvider } from './contexts/AudioPlayerContext';
import { QueuePanelProvider, useQueuePanel } from './contexts/QueuePanelContext';
import { GlobalPlayer } from './components/GlobalPlayer';
import { QueueSidebar } from './components/QueueSidebar';
// import './App.css'; // Removing App.css
import { ModeSwitcher } from './components/ModeSwitcher';
import { TagGroup } from './components/TagGroup';
import { ResultCard } from './components/ResultCard';
import { UserProfileCard } from './components/UserProfileCard';
import { PlaylistSidebar } from './components/PlaylistSidebar';
import type { DiscoveryMode, CuratorResponse, TagCategory, UserProfile } from './types';
import { api } from './api';
import { usePopup } from './contexts/PopupContext';
import { ScrollArea } from './components/ui/scroll-area';
import { Button } from './components/ui/button';
import { Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

function AppContent() {
  const { showPopup } = usePopup();

  const [mode, setMode] = useState<DiscoveryMode>('default');
  const [prompt, setPrompt] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('Ready');
  const [result, setResult] = useState<CuratorResponse | null>(null);
  const [tagCategories, setTagCategories] = useState<TagCategory[]>([]);

  // User Profile State
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [analyzingProfile, setAnalyzingProfile] = useState(false);

  // Playlist list refresh trigger
  const [refreshPlaylists, setRefreshPlaylists] = useState(0);

  // Init: Fetch Tags
  useEffect(() => {
    // Load Tags
    api.getTags()
      .then(setTagCategories)
      .catch(err => {
        console.error("Failed to load tags:", err);
        setStatusText("Failed to load configuration");
      });

    // Load User Profile
    const savedProfile = localStorage.getItem('navi_user_profile');
    if (savedProfile) {
      try {
        setUserProfile(JSON.parse(savedProfile));
      } catch (e) {
        console.error("Failed to parse saved profile", e);
        localStorage.removeItem('navi_user_profile');
      }
    }
  }, []);

  const handleAnalyzeProfile = async () => {
    if (analyzingProfile) return;
    setAnalyzingProfile(true);
    setStatusText("正在分析用户画像 (这可能需要几十秒)...");

    try {
      const profile = await api.analyzeUserProfile();
      setUserProfile(profile);
      localStorage.setItem('navi_user_profile', JSON.stringify(profile));
      showPopup({ message: `画像分析完成: ${profile.display_card.title}`, title: 'Success' });
      setStatusText("Ready");
    } catch (e: any) {
      showPopup({ message: '画像分析失败: ' + e.message, title: 'Error' });
      setStatusText("Error analyzing profile");
    } finally {
      setAnalyzingProfile(false);
    }
  };

  const toggleTag = (tag: string) => {
    const next = new Set(selectedTags);
    if (next.has(tag)) {
      next.delete(tag);
    } else {
      next.add(tag);
    }
    setSelectedTags(next);
  };

  const generate = async () => {
    const combinedPrompt = [prompt, ...Array.from(selectedTags)].filter(Boolean).join(', ');

    if (!combinedPrompt) {
      showPopup({ message: '请输入提示词或选择标签', title: 'Input Required' });
      return;
    }

    if (!userProfile) {
      showPopup({ message: '请先点击 "Generate Persona" 生成用户画像，然后再生成歌单。', title: 'Persona Required' });
      return;
    }

    setLoading(true);
    setStatusText(`正在[${getModeName(mode)}]下为您生成...`);
    setResult(null);

    try {
      // Pass userProfile if exists
      const data = await api.generatePlaylist(combinedPrompt, mode, userProfile || undefined);
      setResult(data);
      setStatusText('Ready');
      // Refresh playlist list
      setRefreshPlaylists(prev => prev + 1);
    } catch (e: any) {
      console.error(e);
      showPopup({ message: 'Error: ' + e.message, title: 'Generation Failed' });
      setStatusText('Error');
    } finally {
      setLoading(false);
    }
  };

  const getModeName = (m: DiscoveryMode) => {
    if (m === 'familiar') return '熟悉模式';
    if (m === 'fresh') return '新鲜模式';
    return '默认模式';
  };

  const { isQueueOpen } = useQueuePanel();

  return (
    <div className="relative h-screen w-full bg-background text-foreground overflow-hidden font-sans selection:bg-primary/20">
      <div className="absolute inset-0 flex overflow-hidden">
        {/* Sidebar - Fix: Added bg-black/60 for better contrast, prevented overlap visual issues */}
        <PlaylistSidebar
          className="hidden md:flex w-64 flex-shrink-0 glass-panel bg-black/60 backdrop-blur-2xl border-r-0 rounded-2xl ml-4 my-4 z-20 shadow-2xl"
          refreshTrigger={refreshPlaylists}
          onRefresh={() => setRefreshPlaylists(p => p + 1)}
        />

        {/* Main Content */}
        <div className="flex-1 flex flex-col relative min-w-0 bg-transparent">
          <ScrollArea className="flex-1">
            <div className="container max-w-4xl mx-auto p-6 md:p-10 space-y-8" style={{ marginBottom: '220px' }}>
              {/* Header */}
              <header className="text-center space-y-2 mb-8">
                <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl text-foreground text-glow">
                  NaviMuse
                </h1>
                <p className="text-muted-foreground font-medium">AI Music Curator</p>
              </header>

              {/* Controls */}
              <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-card p-4 rounded-xl border shadow-sm">
                <div className="flex-1 w-full md:w-auto">
                  <ModeSwitcher current={mode} onChange={setMode} />
                </div>
                <Button
                  variant={analyzingProfile ? "secondary" : "default"}
                  onClick={handleAnalyzeProfile}
                  disabled={analyzingProfile}
                  className="w-full md:w-auto min-w-[140px] shadow-lg shadow-primary/30 hover:shadow-primary/50 transition-all duration-300 hover:scale-105 border border-primary/50"
                >
                  {analyzingProfile ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      分析中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      {userProfile ? '更新画像' : '生成画像'}
                    </>
                  )}
                </Button>
              </div>

              {/* Profile Card */}
              <AnimatePresence mode="wait">
                {userProfile && (
                  <motion.div
                    key="profile-card"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  >
                    <UserProfileCard profile={userProfile} />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Tags */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold tracking-tight">Vibe Tags</h3>
                <TagGroup
                  categories={tagCategories}
                  selectedTags={selectedTags}
                  onToggle={toggleTag}
                />
              </div>
            </div>
          </ScrollArea>

          {/* Input Area - Floating Glass Bar */}
          <div className="absolute bottom-24 left-0 right-0 p-4 pointer-events-none flex justify-center z-10">
            <div className="w-full max-w-3xl glass-panel rounded-full p-2 pointer-events-auto flex gap-2">
              <input
                type="text"
                className="flex-1 h-12 px-6 rounded-full bg-transparent border-none focus:ring-0 text-foreground placeholder-muted-foreground/70"
                placeholder="描述当下的心情... (例如：下雨天的爵士乐)"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && generate()}
              />
              <Button
                size="icon"
                className="h-12 w-12 rounded-full shrink-0 shadow-lg hover:shadow-primary/50 transition-all bg-primary hover:bg-primary/90 text-primary-foreground"
                onClick={generate}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
              </Button>
            </div>
          </div>

          {/* Result Modal Overlay */}
          <AnimatePresence>
            {(result || loading) && (
              <motion.div
                key="result-modal"
                className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex justify-center items-center p-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => !loading && setResult(null)}
              >
                <motion.div
                  className="w-full max-w-2xl bg-card border border-border shadow-2xl rounded-2xl overflow-hidden glass-panel"
                  initial={{ scale: 0.9, y: 50, opacity: 0 }}
                  animate={{ scale: 1, y: 0, opacity: 1 }}
                  exit={{ scale: 0.95, y: 20, opacity: 0 }}
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  onClick={e => e.stopPropagation()}
                >
                  {result && !loading && (
                    <div className="absolute top-4 right-4 z-10">
                      <Button variant="ghost" size="icon" onClick={() => setResult(null)} className="hover:bg-white/10 rounded-full">
                        <span className="text-xl">×</span>
                      </Button>
                    </div>
                  )}
                  <div className="max-h-[85vh] overflow-y-auto">
                    <ResultCard data={result} loading={loading} statusText={statusText} />
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Queue Sidebar - Third Column with slide animation */}
        <AnimatePresence>
          {isQueueOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="hidden md:flex flex-shrink-0 border-l border-white/10 my-4 mr-4 rounded-2xl overflow-hidden shadow-2xl"
            >
              <QueueSidebar />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Global Player - Always visible at bottom, floating above content */}
      <div className="fixed bottom-4 left-4 right-4 z-50 flex justify-center pointer-events-none">
        <div className="w-full max-w-5xl pointer-events-auto">
          <GlobalPlayer />
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <AudioPlayerProvider>
      <QueuePanelProvider>
        <AppContent />
      </QueuePanelProvider>
    </AudioPlayerProvider>
  );
}

export default App;
