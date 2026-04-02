'use client';

import { useEffect, useState, Suspense } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, AlertCircle } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const errorDetails = searchParams.get('details');
  const errorMsg = searchParams.get('msg');
  const [isRedirecting, setIsRedirecting] = useState(!error);

  useEffect(() => {
    if (error) {
      setIsRedirecting(false);
      return;
    }

    // Automatically redirect to Casdoor SSO
    const casdoorUrl = process.env.NEXT_PUBLIC_CASDOOR_URL;
    const clientId = process.env.NEXT_PUBLIC_CASDOOR_CLIENT_ID;

    if (casdoorUrl && clientId) {
      const redirectUri = encodeURIComponent(`${window.location.origin}/callback`);
      const state = encodeURIComponent('/');
      const loginUrl = `${casdoorUrl}/login/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&scope=read&state=${state}`;
      window.location.href = loginUrl;
    }
  }, [error]);

  return (
    <div className="flex flex-col items-center gap-6 text-center z-10 p-8 rounded-2xl bg-black/40 border border-white/5 backdrop-blur-xl">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/20 border border-primary/30">
        <Sparkles className="text-primary" size={32} />
      </div>
      <h1 className="text-3xl font-bold tracking-tight font-heading">KOMEDIA</h1>
      
      {error ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mt-4 p-4 border border-red-500/30 bg-red-500/10 rounded-xl max-w-md text-left"
        >
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="text-red-400 h-5 w-5" />
            <h3 className="font-semibold text-red-100">Authentication Failed</h3>
          </div>
          <p className="text-sm text-red-200/80 mb-3">
            Code: {error}
          </p>
          {(errorDetails || errorMsg) && (
            <div className="bg-black/50 p-3 rounded text-xs font-mono text-red-300 break-words overflow-hidden">
              {errorMsg || errorDetails}
            </div>
          )}
          <button 
            onClick={() => window.location.href = '/login'}
            className="mt-4 w-full py-2 bg-white/10 hover:bg-white/20 transition-colors rounded text-sm font-medium"
          >
            Try Again
          </button>
        </motion.div>
      ) : (
        <>
          <p className="text-gray-400 text-sm uppercase tracking-widest">Redirecting to Identity System...</p>
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mt-4" />
        </>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#05070a] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 stellar-grid opacity-20" />
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-primary/10 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-500/10 blur-[120px] rounded-full" />

      <Suspense fallback={<div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />}>
        <LoginContent />
      </Suspense>

      <p className="absolute bottom-8 text-[10px] text-gray-600 font-bold uppercase tracking-widest">
        © 2026 Komedia Ltd. Co.
      </p>
    </div>
  );
}
