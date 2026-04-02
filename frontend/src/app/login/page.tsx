'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Zap, ShieldCheck, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        body: JSON.stringify({ password }),
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();

      if (data.success) {
        toast.success('Authentication successful. Welcome, Operator.');
        router.push('/');
      } else {
        toast.error('Invalid credentials. Access denied.');
      }
    } catch (err) {
      toast.error('Authentication service offline.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#05070a] text-white flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute inset-0 stellar-grid opacity-20" />
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-primary/10 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-500/10 blur-[120px] rounded-full" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/20 border border-primary/30 mb-6 relative group">
            <Zap className="text-primary fill-primary group-hover:scale-110 transition-transform" size={32} />
            <div className="absolute inset-0 bg-primary/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2 font-heading">NEXUS</h1>
          <p className="text-gray-500 text-sm font-medium tracking-wide uppercase">Intelligence Platform · Secure Gate</p>
        </div>

        <div className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
          
          <div className="mb-8 flex items-center gap-3 p-4 rounded-xl bg-blue-500/5 border border-blue-500/10">
            <ShieldCheck className="text-primary" size={20} />
            <div className="text-[11px] font-bold text-blue-200/60 uppercase tracking-widest leading-none">
              Internal Company Use Only
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Access Protocol</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" size={18} />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter Operator Password"
                  required
                  className="w-full bg-white/[0.02] border border-white/5 rounded-xl py-4 pl-12 pr-4 text-sm focus:outline-none focus:border-primary/50 focus:bg-white/[0.05] transition-all placeholder:text-gray-700"
                />
              </div>
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 rounded-xl shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:shadow-[0_0_30px_rgba(59,130,246,0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm tracking-wide"
            >
              {loading ? 'Verifying...' : 'Establish Link'}
            </button>
          </form>
        </div>

        <p className="text-center mt-8 text-[10px] text-gray-600 font-bold uppercase tracking-widest">
          © 2026 KnockOut Media Ltd. Co.
        </p>
      </motion.div>
    </div>
  );
}
