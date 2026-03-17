/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Layout, 
  Target, 
  Sparkles, 
  MessageSquare, 
  Zap, 
  Users, 
  BarChart3, 
  RefreshCw, 
  ShieldCheck, 
  PlayCircle,
  ChevronRight,
  ChevronLeft,
  Info,
  Eye,
  Edit2,
  Save,
  X,
  Folder,
  Plus,
  LogOut,
  Trash2,
  LogIn,
  Loader2,
  Wand2,
  Share2,
  Camera,
  Image as ImageIcon,
  FileDown
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { auth, db } from './firebase';
import { generateStoryboard } from './services/geminiService';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User,
  signInAnonymously
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  Timestamp,
  orderBy
} from 'firebase/firestore';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface StoryPlan {
  id: number;
  title: string;
  message: string;
  intention: string;
  visual: string;
  color: string;
  iconId?: string;
  transition?: string;
  imageUrl?: string;
}

interface Project {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  plans: StoryPlan[];
  createdAt: any;
  updatedAt: any;
}

interface Comment {
  id: string;
  projectId: string;
  planId: number;
  text: string;
  authorName: string;
  createdAt: any;
  uid?: string;
}

// Map icons to IDs for storage
const ICON_MAP: Record<string, React.ReactNode> = {
  target: <Target className="w-6 h-6" />,
  sparkles: <Sparkles className="w-6 h-6" />,
  users: <Users className="w-6 h-6" />,
  chart: <BarChart3 className="w-6 h-6" />,
  layout: <Layout className="w-6 h-6" />,
  message: <MessageSquare className="w-6 h-6" />,
  zap: <Zap className="w-6 h-6" />,
  refresh: <RefreshCw className="w-6 h-6" />,
  shield: <ShieldCheck className="w-6 h-6" />,
  play: <PlayCircle className="w-6 h-6" />,
};

const getPdfBackgroundStyle = (colorClass: string) => {
  const colorMap: Record<string, string> = {
    'blue-600': '#2563eb',
    'emerald-500': '#10b981',
    'teal-500': '#14b8a6',
    'cyan-500': '#06b6d4',
    'blue-500': '#3b82f6',
    'indigo-600': '#4f46e5',
    'indigo-500': '#6366f1',
    'violet-600': '#7c3aed',
    'violet-500': '#8b5cf6',
    'purple-600': '#9333ea',
    'purple-500': '#a855f7',
    'fuchsia-600': '#c026d3',
    'fuchsia-500': '#d946ef',
    'rose-600': '#e11d48',
    'orange-600': '#ea580c',
  };

  const parts = colorClass.split(' ');
  const from = parts.find(p => p.startsWith('from-'))?.replace('from-', '');
  const to = parts.find(p => p.startsWith('to-'))?.replace('to-', '');

  if (from && to && colorMap[from] && colorMap[to]) {
    return { background: `linear-gradient(to bottom right, ${colorMap[from]}, ${colorMap[to]})` };
  }
  
  return { backgroundColor: '#10b981' };
};

const DEFAULT_PLANS = [
  { id: 1, title: "Ambition stratégique", message: "La mobilité interne est stratégique.", intention: "Installer le sujet au niveau décisionnaire.", visual: "Fond dégradé brand bleu → vert.", color: "from-blue-600 to-emerald-500", iconId: 'target', transition: "Léger mouvement du fond." },
  { id: 2, title: "Question d’amplification", message: "Et si vous pouviez la rendre encore plus fluide ?", intention: "Suggérer la fluidité.", visual: "Les éléments UI s’organisent.", color: "from-emerald-500 to-teal-500", iconId: 'sparkles' },
  { id: 3, title: "Clarté collaborateur", message: "Encore plus claire pour vos collaborateurs.", intention: "Hiérarchisation visuelle.", visual: "Suggestions d’opportunités.", color: "from-teal-500 to-cyan-500", iconId: 'users' },
  { id: 4, title: "Efficacité RH", message: "Encore plus efficace pour vos équipes RH.", intention: "Montrer la simplification.", visual: "Transition morphing vers vue admin.", color: "from-cyan-500 to-blue-500", iconId: 'chart', transition: "Éléments se resserrent." },
  { id: 5, title: "Reveal", message: "Découvrez la nouvelle expérience de matching 365Talents.", intention: "Reveal de l'intégration.", visual: "Interface stabilisée.", color: "from-blue-500 to-indigo-600", iconId: 'layout' },
  { id: 6, title: "Intuitivité", message: "Une interface conversationnelle.", intention: "Fluidité de l'interaction.", visual: "Bulles stylisées.", color: "from-indigo-500 to-violet-600", iconId: 'message' },
  { id: 7, title: "Pédagogie", message: "Des opportunités contextualisées.", intention: "Logique métier.", visual: "Split léger.", color: "from-violet-500 to-purple-600", iconId: 'zap' },
  { id: 8, title: "Impact RH & Adoption", message: "Une recherche adaptée aux intentions.", intention: "Démontrer la propreté des flux.", visual: "Retour vue macro.", color: "from-purple-500 to-fuchsia-600", iconId: 'refresh' },
  { id: 9, title: "Conduite du changement", message: "Un accompagnement structuré.", intention: "Rassurer l'admin.", visual: "Transition institutionnelle.", color: "from-fuchsia-500 to-rose-600", iconId: 'shield' },
  { id: 10, title: "Activation", message: "Activez cette nouvelle expérience.", intention: "CTA final.", visual: "Fond brand épuré.", color: "from-rose-600 to-orange-600", iconId: 'play' },
];

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [guestId, setGuestId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [activePlan, setActivePlan] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'focus' | 'projects'>('projects');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<StoryPlan>>({});
  const [newProjectName, setNewProjectName] = useState('');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editProjectName, setEditProjectName] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [showAIModal, setShowAIModal] = useState(false);
  const [showShareToast, setShowShareToast] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [error, setError] = useState<FirestoreErrorInfo | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newCommentText, setNewCommentText] = useState('');
  const [commentAuthorName, setCommentAuthorName] = useState('');
  const [readStatus, setReadStatus] = useState<Record<string, Record<number, number>>>(() => {
    const saved = localStorage.getItem('storymapping_read_status');
    return saved ? JSON.parse(saved) : {};
  });

  const currentProject = projects.find(p => p.id === selectedProjectId);
  const isProjectLoading = selectedProjectId && !currentProject;
  const storyData = currentProject?.plans || [];
  const currentPlan = activePlan !== null ? storyData.find(p => p.id === activePlan) : null;
  const isOwner = currentProject && currentProject.ownerId === (user?.uid || guestId);

  const markPlanAsRead = (projectId: string, planId: number) => {
    setReadStatus(prev => {
      const newStatus = {
        ...prev,
        [projectId]: {
          ...(prev[projectId] || {}),
          [planId]: Date.now()
        }
      };
      localStorage.setItem('storymapping_read_status', JSON.stringify(newStatus));
      return newStatus;
    });
  };

  const getUnreadCount = (projectId: string, planId?: number) => {
    const projectReadStatus = readStatus[projectId] || {};
    return comments.filter(c => {
      if (c.projectId !== projectId) return false;
      if (planId !== undefined && c.planId !== planId) return false;
      
      const lastRead = projectReadStatus[c.planId] || 0;
      const commentTime = c.createdAt?.toMillis ? c.createdAt.toMillis() : Date.now();
      return commentTime > lastRead;
    }).length;
  };

  useEffect(() => {
    // Initialize Guest ID if not exists
    let gId = localStorage.getItem('storymapping_guest_id');
    if (!gId) {
      gId = 'guest_' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('storymapping_guest_id', gId);
    }
    setGuestId(gId);

    const params = new URLSearchParams(window.location.search);
    const pId = params.get('p');
    if (pId) {
      setSelectedProjectId(pId);
      setViewMode('grid');
    }

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (!u) {
        signInAnonymously(auth).catch(err => console.error('Anonymous auth error:', err));
      }
      setUser(u);
      setAuthLoading(false);
      // Only reset if we are not viewing a shared project
      const currentPId = new URLSearchParams(window.location.search).get('p');
      if (!u && !currentPId && !localStorage.getItem('storymapping_guest_id')) {
        setProjects([]);
        setSelectedProjectId(null);
        setViewMode('projects');
      }
    });
    return unsubscribe;
  }, []);

  // Fetch owned projects (User or Guest)
  useEffect(() => {
    const ownerId = user?.uid || guestId;
    if (!ownerId) return;

    const q = query(collection(db, 'projects'), where('ownerId', '==', ownerId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const projs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
      setProjects(prev => {
        const otherProjects = prev.filter(p => p.ownerId !== ownerId);
        return [...otherProjects, ...projs];
      });
    }, (err) => {
      setError(handleFirestoreError(err, OperationType.LIST, 'projects'));
    });

    return unsubscribe;
  }, [user, guestId]);

  // Fetch selected project (especially if shared/not owned)
  useEffect(() => {
    if (!selectedProjectId) return;

    // If we already have it and we are the owner, the other effect handles updates
    const isAlreadyLoadedAsOwner = user && projects.find(p => p.id === selectedProjectId && p.ownerId === user.uid);
    if (isAlreadyLoadedAsOwner) return;

    const unsubscribe = onSnapshot(doc(db, 'projects', selectedProjectId), (snapshot) => {
      if (snapshot.exists()) {
        const projectData = { id: snapshot.id, ...snapshot.data() } as Project;
        setProjects(prev => {
          const exists = prev.find(p => p.id === projectData.id);
          if (exists) {
            return prev.map(p => p.id === projectData.id ? projectData : p);
          }
          return [...prev, projectData];
        });
      } else {
        // If project doesn't exist, maybe clear selection
        setSelectedProjectId(null);
        setViewMode('projects');
      }
    }, (err) => {
      setError(handleFirestoreError(err, OperationType.GET, `projects/${selectedProjectId}`));
    });

    return unsubscribe;
  }, [selectedProjectId, user]);

  useEffect(() => {
    const ownerId = user?.uid || guestId;
    if (!ownerId) return;

    // Fetch comments for all projects owned by the user/guest to show bubbles in project list
    const q = query(
      collection(db, 'comments'),
      orderBy('createdAt', 'asc')
    );
    // Note: In a real app with many users, we'd filter by projectId in projects.map(p => p.id)
    // but Firestore 'in' query is limited. For this app, we'll fetch all and filter client-side
    // or just fetch for the selected project.
    // To support bubbles on "each project", we need a broader fetch.
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const comms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comment));
      setComments(comms);
    }, (err) => {
      console.error('Comments fetch error:', err);
    });
    return unsubscribe;
  }, [user, guestId]);

  useEffect(() => {
    if (viewMode === 'focus' && selectedProjectId && activePlan !== null) {
      markPlanAsRead(selectedProjectId, activePlan);
    }
  }, [viewMode, selectedProjectId, activePlan]);

  const login = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      console.error('Login error:', err);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const createProject = async () => {
    if (authLoading) return;
    let ownerId = user?.uid;
    
    if (!ownerId) {
      try {
        const cred = await signInAnonymously(auth);
        ownerId = cred.user.uid;
      } catch (err) {
        setError(handleFirestoreError(err, OperationType.CREATE, 'projects'));
        return;
      }
    }

    if (!newProjectName.trim()) return;
    setIsCreatingProject(true);
    try {
      const docRef = await addDoc(collection(db, 'projects'), {
        name: newProjectName,
        ownerId: ownerId,
        plans: DEFAULT_PLANS,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setNewProjectName('');
      setSelectedProjectId(docRef.id);
      setViewMode('grid');
    } catch (err) {
      setError(handleFirestoreError(err, OperationType.CREATE, 'projects'));
    } finally {
      setIsCreatingProject(false);
    }
  };

  const deleteProject = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'projects', id));
      if (selectedProjectId === id) {
        setSelectedProjectId(null);
        setViewMode('projects');
      }
      setProjectToDelete(null);
    } catch (err) {
      setError(handleFirestoreError(err, OperationType.DELETE, `projects/${id}`));
    }
  };

  const confirmDeleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setProjectToDelete(id);
  };

  const renameProject = async (id: string, e?: React.FormEvent | React.FocusEvent) => {
    if (e) e.preventDefault();
    if (editingProjectId !== id) return; // Prevent double calls
    
    if (!editProjectName.trim()) {
      setEditingProjectId(null);
      return;
    }
    
    // If name hasn't changed, just close
    const project = projects.find(p => p.id === id);
    if (project && project.name === editProjectName) {
      setEditingProjectId(null);
      return;
    }

    try {
      // Optimistically update UI to prevent flicker or double triggers
      setEditingProjectId(null);
      
      await updateDoc(doc(db, 'projects', id), {
        name: editProjectName,
        updatedAt: serverTimestamp(),
      });
      setEditProjectName('');
    } catch (err) {
      // Revert on error
      setEditingProjectId(id);
      setError(handleFirestoreError(err, OperationType.UPDATE, `projects/${id}`));
    }
  };

  const startRenamingProject = (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProjectId(project.id);
    setEditProjectName(project.name);
  };

  const nextPlan = () => {
    if (activePlan === null) setActivePlan(1);
    else if (activePlan < storyData.length) setActivePlan(activePlan + 1);
  };

  const prevPlan = () => {
    if (activePlan !== null && activePlan > 1) setActivePlan(activePlan - 1);
  };

  const startEditing = (plan: StoryPlan, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(plan.id);
    setEditForm(plan);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async () => {
    if (editingId === null || !selectedProjectId || !currentProject) return;
    
    const updatedPlans = currentProject.plans.map(p => 
      p.id === editingId ? { ...p, ...editForm } as StoryPlan : p
    );

    try {
      await updateDoc(doc(db, 'projects', selectedProjectId), {
        plans: updatedPlans,
        updatedAt: serverTimestamp(),
      });
      setEditingId(null);
      setEditForm({});
    } catch (err) {
      setError(handleFirestoreError(err, OperationType.UPDATE, `projects/${selectedProjectId}`));
    }
  };

  const handleFormChange = (field: keyof StoryPlan, value: string) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditForm(prev => ({ ...prev, imageUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerateAI = async () => {
    if (!aiPrompt.trim() || !selectedProjectId) return;
    setIsGeneratingAI(true);
    try {
      const generatedPlans = await generateStoryboard(aiPrompt);
      await updateDoc(doc(db, 'projects', selectedProjectId), {
        plans: generatedPlans,
        updatedAt: serverTimestamp(),
      });
      setShowAIModal(false);
      setAiPrompt('');
      setActivePlan(null);
    } catch (err) {
      console.error('AI Generation error:', err);
      setError({
        error: "Échec de la génération par l'IA. Veuillez réessayer.",
        operationType: OperationType.UPDATE,
        path: `projects/${selectedProjectId}`,
        authInfo: { userId: user?.uid, email: user?.email }
      });
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const copyShareLink = () => {
    if (!selectedProjectId) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('p', selectedProjectId);
      // Ensure we use the root path to avoid 404s on subpaths if any
      url.pathname = '/';
      
      const shareUrl = url.toString();
      navigator.clipboard.writeText(shareUrl);
      setShowShareToast(true);
      setTimeout(() => setShowShareToast(false), 3000);
    } catch (err) {
      console.error('Error copying share link:', err);
      // Fallback
      const fallbackUrl = window.location.origin + '/?p=' + selectedProjectId;
      navigator.clipboard.writeText(fallbackUrl);
      setShowShareToast(true);
      setTimeout(() => setShowShareToast(false), 3000);
    }
  };

  const exportToPDF = async () => {
    const container = document.getElementById('pdf-export-container');
    if (!container) return;
    
    setIsExporting(true);
    try {
      // Show container and wait for browser to paint
      container.style.display = 'block';
      await new Promise(resolve => setTimeout(resolve, 500));

      // Wait for all images in the container to be loaded
      const images = container.querySelectorAll('img');
      const imagePromises = Array.from(images).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      });
      await Promise.all(imagePromises);

      const pages = container.querySelectorAll('.pdf-page');
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
        compress: true
      });
      
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i] as HTMLElement;
        const canvas = await html2canvas(page, {
          scale: 3, // Higher scale for better quality
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: '#ffffff',
          width: 1200,
          height: 1600,
          imageTimeout: 15000,
          onclone: (clonedDoc) => {
            const clonedPage = clonedDoc.querySelector('.pdf-page') as HTMLElement;
            if (clonedPage) {
              clonedPage.style.display = 'block';
            }
          }
        });
        
        const imgData = canvas.toDataURL('image/jpeg', 0.95); // Use JPEG with high quality for better compression
        if (i > 0) pdf.addPage();
        
        pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
      }
      
      pdf.save(`${currentProject?.name || 'storyboard'}.pdf`);
    } catch (err) {
      console.error('Error generating PDF:', err);
    } finally {
      container.style.display = 'none';
      setIsExporting(false);
    }
  };

  const addComment = async (planId: number) => {
    if (!newCommentText.trim() || !selectedProjectId) return;
    try {
      await addDoc(collection(db, 'comments'), {
        projectId: selectedProjectId,
        planId,
        text: newCommentText,
        authorName: commentAuthorName || (user?.displayName) || 'Anonyme',
        createdAt: serverTimestamp(),
        uid: user?.uid || guestId
      });
      setNewCommentText('');
    } catch (err) {
      console.error('Error adding comment:', err);
    }
  };

  const deleteComment = async (commentId: string) => {
    try {
      await deleteDoc(doc(db, 'comments', commentId));
    } catch (err) {
      console.error('Error deleting comment:', err);
    }
  };

  if (authLoading || isProjectLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          {isProjectLoading && <p className="text-xs font-bold text-black/20 uppercase tracking-widest">Chargement du projet...</p>}
        </div>
      </div>
    );
  }

  // Removed login wall as requested

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans selection:bg-emerald-100">
      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {projectToDelete && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-sm rounded-3xl p-8 shadow-2xl"
            >
              <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center text-red-500 mb-6">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-2">Supprimer le projet ?</h3>
              <p className="text-sm text-black/50 mb-8">
                Cette action est irréversible. Toutes les données de ce storyboard seront définitivement supprimées.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setProjectToDelete(null)}
                  className="flex-1 px-6 py-3 rounded-2xl font-bold bg-black/5 hover:bg-black/10 transition-all"
                >
                  Annuler
                </button>
                <button 
                  onClick={() => deleteProject(projectToDelete)}
                  className="flex-1 bg-red-500 text-white px-6 py-3 rounded-2xl font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-100"
                >
                  Supprimer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Error Boundary / Display */}
      {error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-4">
          <div className="bg-red-50 border border-red-200 p-4 rounded-2xl shadow-xl flex items-start gap-3">
            <X className="w-5 h-5 text-red-500 shrink-0 cursor-pointer" onClick={() => setError(null)} />
            <div>
              <p className="text-sm font-bold text-red-800">Erreur Firestore</p>
              <p className="text-xs text-red-600 mt-1">{error.error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Share Toast */}
      <AnimatePresence>
        {showShareToast && (
          <motion.div 
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            className="fixed bottom-24 left-1/2 z-[100] bg-black text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3"
          >
            <Share2 className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-bold">Lien copié dans le presse-papier !</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-black/5 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div 
              className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white cursor-pointer shadow-lg shadow-emerald-100"
              onClick={() => setViewMode('projects')}
            >
              <Layout className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">
                {selectedProjectId && currentProject ? (
                  editingProjectId === currentProject.id ? (
                    <form onSubmit={(e) => renameProject(currentProject.id, e)}>
                      <input 
                        autoFocus
                        className="bg-black/5 border-none rounded px-2 py-0.5 text-lg font-semibold focus:ring-2 focus:ring-emerald-500 outline-none"
                        value={editProjectName}
                        onChange={(e) => setEditProjectName(e.target.value)}
                        onBlur={(e) => renameProject(currentProject.id, e)}
                      />
                    </form>
                  ) : (
                    <span 
                      className={cn("flex items-center gap-2", isOwner && "cursor-pointer hover:text-emerald-600")}
                      onClick={(e) => isOwner && startRenamingProject(currentProject, e)}
                    >
                      {currentProject.name}
                      {isOwner && <Edit2 className="w-3 h-3 opacity-40" />}
                    </span>
                  )
                ) : (
                  "Mes Projets"
                )}
                {selectedProjectId && !isOwner && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-[10px] font-bold text-emerald-600 uppercase tracking-wider border border-emerald-100">
                    Consultation & Commentaires
                  </span>
                )}
              </h1>
              <p className="text-[10px] text-black/40 font-bold uppercase tracking-widest">
                {user ? user.displayName : "Visiteur"}
              </p>
            </div>
          </div>
            <div className="flex items-center gap-3">
              {!user && (
                <button 
                  onClick={login}
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-white border border-black/5 text-black/60 hover:bg-black/5 transition-all shadow-sm"
                >
                  <LogIn className="w-4 h-4" />
                  Se connecter
                </button>
              )}
              {viewMode !== 'projects' && (
                <>
                  {isOwner && (
                    <button 
                      onClick={() => setShowAIModal(true)}
                      className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-100"
                    >
                      <Wand2 className="w-4 h-4" />
                      Générer avec l'IA
                    </button>
                  )}
                  <button 
                    onClick={copyShareLink}
                    className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-white border border-black/5 text-black/60 hover:bg-black/5 transition-all shadow-sm"
                    title="Partager le projet"
                  >
                    <Share2 className="w-4 h-4" />
                    Partager
                  </button>
                  <button 
                    onClick={exportToPDF}
                    disabled={isExporting}
                    className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-white border border-black/5 text-black/60 hover:bg-black/5 transition-all shadow-sm disabled:opacity-50"
                    title="Exporter en PDF"
                  >
                    {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                    Exporter PDF
                  </button>
                  <button 
                    onClick={() => setViewMode('grid')}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-medium transition-all",
                    viewMode === 'grid' ? "bg-black text-white" : "bg-black/5 hover:bg-black/10 text-black/60"
                  )}
                >
                  Vue d'ensemble
                </button>
                <button 
                  onClick={() => {
                    setViewMode('focus');
                    if (activePlan === null) setActivePlan(1);
                  }}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-medium transition-all",
                    viewMode === 'focus' ? "bg-black text-white" : "bg-black/5 hover:bg-black/10 text-black/60"
                  )}
                >
                  Mode Focus
                </button>
              </>
            )}
            <button 
              onClick={() => setViewMode('projects')}
              className="p-2 rounded-full bg-black/5 hover:bg-black/10 text-black/60 transition-all"
              title="Changer de projet"
            >
              <Folder className="w-5 h-5" />
            </button>
            {user ? (
              <button 
                onClick={logout}
                className="p-2 rounded-full bg-red-50 hover:bg-red-100 text-red-500 transition-all"
                title="Déconnexion"
              >
                <LogOut className="w-5 h-5" />
              </button>
            ) : (
              <button 
                onClick={login}
                className="p-2 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-500 transition-all"
                title="Connexion"
              >
                <LogIn className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 lg:p-12">
        <AnimatePresence mode="wait">
          {showAIModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl"
              >
                <div className="flex justify-between items-center mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white">
                      <Wand2 className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-bold">Générer avec l'IA</h3>
                  </div>
                  <button onClick={() => setShowAIModal(false)} className="p-2 hover:bg-black/5 rounded-full">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <p className="text-sm text-black/50 mb-6">
                  Décrivez votre projet vidéo en quelques phrases. L'IA générera une structure complète de story mapping pour vous.
                </p>

                <textarea 
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Ex: Une vidéo de présentation pour une nouvelle application de fitness qui met l'accent sur la simplicité et le coaching personnalisé..."
                  className="w-full bg-black/5 border-none rounded-2xl px-4 py-4 text-sm focus:ring-2 focus:ring-emerald-500 outline-none min-h-[150px] resize-none mb-6"
                />

                <div className="flex gap-3">
                  <button 
                    onClick={() => setShowAIModal(false)}
                    className="flex-1 px-6 py-3 rounded-2xl font-bold bg-black/5 hover:bg-black/10 transition-all"
                  >
                    Annuler
                  </button>
                  <button 
                    onClick={handleGenerateAI}
                    disabled={isGeneratingAI || !aiPrompt.trim()}
                    className="flex-[2] bg-emerald-500 text-white px-6 py-3 rounded-2xl font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-100 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isGeneratingAI ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Génération...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" />
                        Générer le storyboard
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {viewMode === 'projects' ? (
            <motion.div 
              key="projects"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                  <h2 className="text-4xl font-bold tracking-tight mb-2">Vos Storyboards</h2>
                  <p className="text-black/50">Gérez vos différents projets de mapping vidéo.</p>
                </div>
                <div className="flex w-full md:w-auto gap-3">
                  <input 
                    type="text" 
                    placeholder="Nom du nouveau projet..."
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    className="flex-1 md:w-64 bg-white border border-black/5 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm"
                  />
                  <button 
                    onClick={createProject}
                    disabled={isCreatingProject || !newProjectName.trim()}
                    className="bg-emerald-500 text-white px-6 py-3 rounded-2xl font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-100 disabled:opacity-50 flex items-center gap-2"
                  >
                    {isCreatingProject ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                    Créer
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.length === 0 ? (
                  <div className="col-span-full py-24 text-center border-2 border-dashed border-black/5 rounded-3xl">
                    <Folder className="w-12 h-12 text-black/10 mx-auto mb-4" />
                    <p className="text-black/30 font-medium">Aucun projet pour le moment.</p>
                  </div>
                ) : (
                  projects.map((project) => (
                    <motion.div
                      key={project.id}
                      whileHover={{ y: -4 }}
                      onClick={() => {
                        setSelectedProjectId(project.id);
                        setViewMode('grid');
                      }}
                      className="group bg-white p-8 rounded-3xl border border-black/5 shadow-sm hover:shadow-xl hover:shadow-black/5 transition-all cursor-pointer relative"
                    >
                      {getUnreadCount(project.id) > 0 && (
                        <div className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-lg border-2 border-white z-10">
                          {getUnreadCount(project.id)}
                        </div>
                      )}
                      <div className="flex justify-between items-start mb-6">
                        <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-500">
                          <Folder className="w-6 h-6" />
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={(e) => startRenamingProject(project, e)}
                            className="p-2 rounded-lg bg-black/5 text-black/40 hover:bg-black/10 hover:text-black/60 transition-all"
                            title="Renommer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={(e) => confirmDeleteProject(project.id, e)}
                            className="p-2 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 transition-all"
                            title="Supprimer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      {editingProjectId === project.id ? (
                        <form 
                          onSubmit={(e) => renameProject(project.id, e)}
                          onClick={(e) => e.stopPropagation()}
                          className="mb-2"
                        >
                          <input 
                            autoFocus
                            className="w-full bg-black/5 border-none rounded-lg px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                            value={editProjectName}
                            onChange={(e) => setEditProjectName(e.target.value)}
                            onBlur={(e) => renameProject(project.id, e)}
                          />
                        </form>
                      ) : (
                        <h3 className="text-xl font-bold mb-2 group-hover:text-emerald-600 transition-colors">{project.name}</h3>
                      )}
                      <p className="text-sm text-black/40 font-medium uppercase tracking-widest">
                        {project.plans.length} Plans • {project.updatedAt?.toDate ? project.updatedAt.toDate().toLocaleDateString() : 'Récemment'}
                      </p>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          ) : viewMode === 'grid' ? (
            <motion.div 
              key="grid"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {storyData.map((plan) => (
                <motion.div
                  key={plan.id}
                  whileHover={editingId === plan.id ? {} : { y: -4 }}
                  className={cn(
                    "group bg-white rounded-2xl border border-black/5 shadow-sm transition-all overflow-hidden relative",
                    editingId === plan.id ? "ring-2 ring-emerald-500 shadow-xl" : "hover:shadow-xl hover:shadow-black/5 cursor-pointer"
                  )}
                  onClick={() => {
                    if (editingId !== plan.id) {
                      setActivePlan(plan.id);
                      setViewMode('focus');
                    }
                  }}
                >
                  {getUnreadCount(selectedProjectId!, plan.id) > 0 && (
                    <div className="absolute top-4 right-4 w-5 h-5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-lg border-2 border-white z-10">
                      {getUnreadCount(selectedProjectId!, plan.id)}
                    </div>
                  )}
                  <div className={cn("h-1.5 w-full bg-gradient-to-r", plan.color)} />
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <span className="text-[10px] font-bold text-black/30 uppercase tracking-[0.2em]">
                        Plan {plan.id.toString().padStart(2, '0')}
                      </span>
                      <div className="flex items-center gap-2">
                        {editingId !== plan.id && isOwner && (
                          <button 
                            onClick={(e) => startEditing(plan, e)}
                            className="p-2 rounded-lg bg-black/5 hover:bg-black/10 text-black/40 hover:text-black/60 transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {getUnreadCount(selectedProjectId!, plan.id) > 0 && (
                          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 text-red-500 text-[10px] font-bold">
                            <MessageSquare className="w-3 h-3" />
                            {getUnreadCount(selectedProjectId!, plan.id)}
                          </div>
                        )}
                        <div className={cn("p-2 rounded-xl bg-gradient-to-br opacity-80", plan.color, "text-white")}>
                          {plan.iconId ? ICON_MAP[plan.iconId] : <Layout className="w-6 h-6" />}
                        </div>
                      </div>
                    </div>

                    {plan.imageUrl && (
                      <div className="aspect-video w-full rounded-xl overflow-hidden mb-4 border border-black/5">
                        <img 
                          src={plan.imageUrl} 
                          alt={plan.title} 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}

                    {editingId === plan.id ? (
                      <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-black/40 uppercase tracking-widest">Titre (Référence)</label>
                          <input 
                            className="w-full bg-black/5 border-none rounded-lg px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-emerald-500 outline-none"
                            value={editForm.title}
                            onChange={(e) => handleFormChange('title', e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-black/40 uppercase tracking-widest">Message Clé</label>
                          <textarea 
                            className="w-full bg-black/5 border-none rounded-lg px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-emerald-500 outline-none min-h-[80px] resize-none"
                            value={editForm.message}
                            onChange={(e) => handleFormChange('message', e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-black/40 uppercase tracking-widest">Intention</label>
                          <textarea 
                            className="w-full bg-black/5 border-none rounded-lg px-3 py-2 text-xs text-black/60 focus:ring-2 focus:ring-emerald-500 outline-none min-h-[60px] resize-none"
                            value={editForm.intention}
                            onChange={(e) => handleFormChange('intention', e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-black/40 uppercase tracking-widest">Visuel</label>
                          <textarea 
                            className="w-full bg-black/5 border-none rounded-lg px-3 py-2 text-xs text-black/60 focus:ring-2 focus:ring-emerald-500 outline-none min-h-[60px] resize-none"
                            value={editForm.visual}
                            onChange={(e) => handleFormChange('visual', e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-black/40 uppercase tracking-widest">Transition</label>
                          <input 
                            className="w-full bg-black/5 border-none rounded-lg px-3 py-2 text-xs text-black/60 focus:ring-2 focus:ring-emerald-500 outline-none"
                            value={editForm.transition || ''}
                            onChange={(e) => handleFormChange('transition', e.target.value)}
                            placeholder="Aucune transition"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-black/40 uppercase tracking-widest">Image (Optionnel)</label>
                          <div className="flex gap-2">
                            <input 
                              type="text"
                              className="flex-1 bg-black/5 border-none rounded-lg px-3 py-2 text-xs text-black/60 focus:ring-2 focus:ring-emerald-500 outline-none"
                              value={editForm.imageUrl || ''}
                              onChange={(e) => handleFormChange('imageUrl', e.target.value)}
                              placeholder="URL de l'image..."
                            />
                            <label className="cursor-pointer p-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all flex items-center justify-center">
                              <Camera className="w-4 h-4" />
                              <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                            </label>
                            {editForm.imageUrl && (
                              <button 
                                onClick={() => handleFormChange('imageUrl', '')}
                                className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 pt-2">
                          <button 
                            onClick={saveEdit}
                            className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all"
                          >
                            <Save className="w-3.5 h-3.5" /> Enregistrer
                          </button>
                          <button 
                            onClick={cancelEditing}
                            className="bg-black/5 hover:bg-black/10 text-black/60 px-4 py-2 rounded-xl text-xs font-bold transition-all"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <h3 className="text-lg font-semibold mb-4 leading-tight group-hover:text-emerald-600 transition-colors">
                          {plan.message}
                        </h3>
                        <div className="pt-4 border-t border-black/5 flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-black/40 uppercase flex items-center gap-1">
                            <Info className="w-3 h-3" /> Intention
                          </span>
                          <ChevronRight className="w-4 h-4 text-black/20 group-hover:translate-x-1 transition-transform" />
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <motion.div 
              key="focus"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              className="min-h-[60vh] flex flex-col items-center justify-center"
            >
              {currentPlan && (
                <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
                  {/* Visual Representation (Abstract) - Sticky on Desktop */}
                  <div className="lg:col-span-7 aspect-video rounded-3xl overflow-hidden shadow-2xl relative group lg:sticky lg:top-8">
                    {currentPlan.imageUrl ? (
                      <div className="absolute inset-0">
                        <img 
                          src={currentPlan.imageUrl} 
                          alt={currentPlan.title} 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    ) : (
                      <div className={cn(
                        "absolute inset-0 bg-gradient-to-br transition-all duration-700",
                        currentPlan.color
                      )}>
                        {/* Abstract UI elements based on visual description */}
                        <div className="absolute inset-0 opacity-20 mix-blend-overlay">
                          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.2),transparent_70%)]" />
                        </div>
                        
                        <div className="absolute inset-0 flex items-center justify-center p-12">
                          <motion.div 
                            key={currentPlan.id}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="w-full h-full border-2 border-white/20 rounded-2xl flex flex-col items-center justify-center text-white text-center"
                          >
                            <div className="mb-6 scale-[2]">
                              {currentPlan.iconId ? ICON_MAP[currentPlan.iconId] : <Layout className="w-6 h-6" />}
                            </div>
                            <p className="text-xs font-mono uppercase tracking-[0.3em] opacity-60 mb-2">Visual Concept</p>
                            <p className="text-sm max-w-sm font-medium leading-relaxed opacity-90">
                              {currentPlan.visual}
                            </p>
                          </motion.div>
                        </div>
                      </div>
                    )}
                    
                    <div className="absolute bottom-6 left-6 right-6 flex justify-between items-end">
                       <div className="bg-black/20 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
                          <span className="text-[10px] font-bold text-white uppercase tracking-widest">
                            Scene {currentPlan.id} / {storyData.length}
                          </span>
                       </div>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="lg:col-span-5 space-y-8">
                    <div>
                      <motion.span 
                        key={`label-${currentPlan.id}`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="text-xs font-bold text-emerald-600 uppercase tracking-[0.2em] mb-2 block"
                      >
                        Plan {currentPlan.id.toString().padStart(2, '0')}
                      </motion.span>
                      <motion.h2 
                        key={`title-${currentPlan.id}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-3xl font-bold tracking-tight mb-4 leading-tight flex items-center justify-between gap-4"
                      >
                        {currentPlan.message}
                        {isOwner && (
                          <button 
                            onClick={(e) => {
                              setViewMode('grid');
                              startEditing(currentPlan, e);
                            }}
                            className="p-3 rounded-xl bg-black/5 hover:bg-black/10 text-black/40 hover:text-black/60 transition-all shrink-0"
                            title="Modifier ce plan"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                        )}
                      </motion.h2>
                    </div>

                    <div className="space-y-6">
                      <section>
                        <h4 className="text-[10px] font-bold text-black/40 uppercase tracking-widest mb-3 flex items-center gap-2">
                          <Target className="w-3 h-3" /> Intention
                        </h4>
                        <motion.p 
                          key={`int-${currentPlan.id}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="text-base text-black/60 leading-relaxed"
                        >
                          {currentPlan.intention}
                        </motion.p>
                      </section>

                      <section>
                        <h4 className="text-[10px] font-bold text-black/40 uppercase tracking-widest mb-3 flex items-center gap-2">
                          <Eye className="w-3 h-3" /> Visuel
                        </h4>
                        <motion.p 
                          key={`vis-${currentPlan.id}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="text-sm text-black/50 leading-relaxed"
                        >
                          {currentPlan.visual}
                        </motion.p>
                      </section>

                      {currentPlan.transition && (
                        <section className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                          <h4 className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <RefreshCw className="w-3 h-3" /> Transition
                          </h4>
                          <motion.p 
                            key={`trans-${currentPlan.id}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-sm text-emerald-800/80 leading-relaxed font-medium"
                          >
                            {currentPlan.transition}
                          </motion.p>
                        </section>
                      )}
                    </div>

                    {/* Navigation */}
                    <div className="pt-8 flex items-center gap-4">
                      <button 
                        onClick={prevPlan}
                        disabled={activePlan === 1}
                        className="p-4 rounded-2xl bg-black/5 hover:bg-black/10 disabled:opacity-30 transition-all"
                      >
                        <ChevronLeft className="w-6 h-6" />
                      </button>
                      <button 
                        onClick={nextPlan}
                        disabled={activePlan === storyData.length}
                        className="flex-1 p-4 rounded-2xl bg-black text-white hover:bg-black/80 disabled:opacity-30 transition-all font-semibold flex items-center justify-center gap-2"
                      >
                        {activePlan === storyData.length ? "Fin du Storyboard" : "Plan Suivant"}
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Comments Section */}
                    <div className="pt-12 border-t border-black/5 space-y-6">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[10px] font-bold text-black/40 uppercase tracking-widest flex items-center gap-2">
                          <MessageSquare className="w-3 h-3" /> Commentaires
                        </h4>
                        {getUnreadCount(selectedProjectId!, currentPlan.id) > 0 && (
                          <span className="text-[10px] font-bold text-white bg-red-500 px-2 py-0.5 rounded-full shadow-sm">
                            {getUnreadCount(selectedProjectId!, currentPlan.id)} nouveaux
                          </span>
                        )}
                      </div>

                      <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {comments.filter(c => c.projectId === selectedProjectId && c.planId === currentPlan.id).length === 0 ? (
                          <p className="text-xs text-black/30 italic py-4">Aucun commentaire pour le moment.</p>
                        ) : (
                          comments.filter(c => c.projectId === selectedProjectId && c.planId === currentPlan.id).map((comment) => (
                            <div key={comment.id} className="bg-white border border-black/5 p-4 rounded-2xl shadow-sm group/comment">
                              <div className="flex justify-between items-start mb-2">
                                <div className="flex flex-col">
                                  <span className="text-xs font-bold text-black/80">{comment.authorName}</span>
                                  <span className="text-[10px] text-black/30">
                                    {comment.createdAt?.toDate ? comment.createdAt.toDate().toLocaleDateString() : 'À l\'instant'}
                                  </span>
                                </div>
                                {(comment.uid === (user?.uid || guestId) || isOwner) && (
                                  <button 
                                    onClick={() => deleteComment(comment.id)}
                                    className="p-1.5 rounded-lg text-black/10 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover/comment:opacity-100"
                                    title="Supprimer le commentaire"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                              <p className="text-sm text-black/60 leading-relaxed">{comment.text}</p>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="bg-black/5 p-4 rounded-2xl space-y-4">
                        {(!user || user.isAnonymous) && (
                          <input 
                            type="text"
                            placeholder="Votre nom pour les commentaires"
                            value={commentAuthorName}
                            onChange={(e) => setCommentAuthorName(e.target.value)}
                            className="w-full bg-white border border-black/5 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          />
                        )}
                        <div className="flex gap-2">
                          <textarea 
                            placeholder="Laissez un commentaire ou un retour..."
                            value={newCommentText}
                            onChange={(e) => setNewCommentText(e.target.value)}
                            className="flex-1 bg-white border border-black/5 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none h-20"
                          />
                          <button 
                            onClick={() => addComment(currentPlan.id)}
                            disabled={!newCommentText.trim()}
                            className="bg-black text-white p-4 rounded-xl hover:bg-black/80 disabled:opacity-30 transition-all self-end"
                          >
                            <Plus className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer / Progress */}
      {viewMode !== 'projects' && (
        <footer className="fixed bottom-0 left-0 right-0 p-6 pointer-events-none">
          <div className="max-w-7xl mx-auto flex justify-center">
            <div className="bg-white/90 backdrop-blur-md border border-black/5 px-6 py-3 rounded-full shadow-lg pointer-events-auto flex items-center gap-4">
              <div className="flex gap-1.5">
                {storyData.map((p) => (
                  <div 
                    key={p.id}
                    onClick={() => {
                      setActivePlan(p.id);
                      setViewMode('focus');
                    }}
                    className={cn(
                      "w-2 h-2 rounded-full transition-all cursor-pointer",
                      activePlan === p.id ? "w-6 bg-emerald-500" : "bg-black/10 hover:bg-black/20"
                    )}
                  />
                ))}
              </div>
              <div className="h-4 w-px bg-black/10 mx-2" />
              <span className="text-[10px] font-bold text-black/40 uppercase tracking-widest">
                {activePlan ? `Plan ${activePlan} sur ${storyData.length}` : 'Sélectionnez un plan'}
              </span>
            </div>
          </div>
        </footer>
      )}

      {/* PDF Export Container (Hidden) */}
      <div id="pdf-export-container" style={{ 
        display: 'none', 
        position: 'fixed', 
        left: '-9999px', 
        top: 0, 
        width: '1200px', 
        backgroundColor: '#ffffff',
        zIndex: -1
      }}>
        {Array.from({ length: Math.ceil(storyData.length / 6) }).map((_, pageIndex) => (
          <div key={pageIndex} className="pdf-page" style={{ 
            padding: '80px', 
            height: '1600px', 
            position: 'relative', 
            backgroundColor: '#ffffff',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {pageIndex === 0 && (
              <div style={{ marginBottom: '60px', borderBottom: '4px solid #10b981', paddingBottom: '30px' }}>
                <h1 style={{ fontSize: '56px', fontWeight: '900', color: '#1a1a1a', margin: 0, letterSpacing: '-0.04em', lineHeight: '1.1' }}>{currentProject?.name}</h1>
                <p style={{ fontSize: '20px', color: '#666666', marginTop: '16px', fontWeight: '500', maxWidth: '800px' }}>{currentProject?.description || 'Storyboard complet'}</p>
              </div>
            )}
            
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(3, 1fr)', 
              gap: '40px',
              flex: 1
            }}>
              {storyData.slice(pageIndex * 6, (pageIndex + 1) * 6).map((plan) => (
                <div key={plan.id} style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ 
                    position: 'relative', 
                    borderRadius: '28px', 
                    overflow: 'hidden', 
                    border: '1px solid #e5e7eb', 
                    aspectRatio: '16/9', 
                    backgroundColor: '#f9fafb', 
                    boxShadow: '0 10px 30px rgba(0,0,0,0.08)' 
                  }}>
                    {plan.imageUrl ? (
                      <img 
                        src={plan.imageUrl} 
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                        crossOrigin="anonymous" 
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%', ...getPdfBackgroundStyle(plan.color) }} />
                    )}
                    <div style={{ 
                      position: 'absolute', 
                      top: '20px', 
                      left: '20px', 
                      background: 'rgba(0,0,0,0.8)', 
                      backdropFilter: 'blur(12px)', 
                      color: '#ffffff', 
                      padding: '8px 16px', 
                      borderRadius: '12px', 
                      fontSize: '14px', 
                      fontWeight: '800', 
                      letterSpacing: '0.1em',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                    }}>
                      PLAN {plan.id.toString().padStart(2, '0')}
                    </div>
                  </div>
                  <div style={{ marginTop: '24px', padding: '0 4px' }}>
                    <h3 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '16px', color: '#111827', lineHeight: '1.3', letterSpacing: '-0.01em' }}>{plan.title}</h3>
                    
                    <div style={{ marginBottom: '12px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '900', color: '#059669', textTransform: 'uppercase', display: 'block', marginBottom: '4px', letterSpacing: '0.05em' }}>Intention</span>
                      <p style={{ fontSize: '15px', color: '#374151', lineHeight: '1.5', fontStyle: 'italic', fontWeight: '500' }}>{plan.intention}</p>
                    </div>

                    {plan.transition && (
                      <div style={{ marginBottom: '12px' }}>
                        <span style={{ fontSize: '11px', fontWeight: '900', color: '#2563eb', textTransform: 'uppercase', display: 'block', marginBottom: '4px', letterSpacing: '0.05em' }}>Transition</span>
                        <p style={{ fontSize: '14px', color: '#4b5563', lineHeight: '1.5' }}>{plan.transition}</p>
                      </div>
                    )}

                    {plan.visual && (
                      <div style={{ marginBottom: '12px' }}>
                        <span style={{ fontSize: '11px', fontWeight: '900', color: '#4f46e5', textTransform: 'uppercase', display: 'block', marginBottom: '4px', letterSpacing: '0.05em' }}>Visuel</span>
                        <p style={{ fontSize: '14px', color: '#4b5563', lineHeight: '1.5' }}>{plan.visual}</p>
                      </div>
                    )}

                    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '2px solid #f3f4f6' }}>
                      <p style={{ fontSize: '13px', color: '#6b7280', lineHeight: '1.6', fontWeight: '400' }}>{plan.message}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div style={{ 
              marginTop: '40px',
              paddingTop: '30px', 
              borderTop: '2px solid #f3f4f6', 
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <p style={{ fontSize: '12px', color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.1em' }}>StoryMapper Studio</p>
              <p style={{ fontSize: '12px', color: '#111827', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Page {pageIndex + 1} / {Math.ceil(storyData.length / 6)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
