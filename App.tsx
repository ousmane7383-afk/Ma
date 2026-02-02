
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { encode, playWelcomeChime } from './services/audioUtils';

const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-12-2025';
const FRAME_RATE = 2.0;
const JPEG_QUALITY = 0.3;
const LOCAL_STORAGE_KEY = 'mabar_gemini_api_key';

// مكون الشعار الاحترافي (يحاكي الصورة المرفوعة بدقة عالية)
const MabarLogo: React.FC<{ size?: string }> = ({ size = "w-16 h-16" }) => (
  <div className={`${size} bg-white rounded-full flex flex-col items-center justify-center border-4 border-teal-600 shadow-inner overflow-hidden p-1`}>
    <div className="flex flex-col items-center justify-center scale-[0.8]">
       <i className="fa-solid fa-person-walking-with-cane text-teal-800 text-3xl"></i>
       <span className="text-[10px] font-black text-teal-900 leading-none tracking-tighter mt-1">MABAR</span>
       <span className="text-[10px] font-black text-teal-900 leading-none">معبر</span>
    </div>
  </div>
);

const App: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'starting' | 'active' | 'paused'>('idle');
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [isReporting, setIsReporting] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [hasSavedKey, setHasSavedKey] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const frameIntervalRef = useRef<number | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const statusRef = useRef(status);
  const isReportingRef = useRef(isReporting);
  const speechVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const isMountedRef = useRef(true);

  const getSystemInstruction = useCallback(() => {
    return `أنت "معبر" (MABAR)، المساعد البصري الذكي. صوتك أنثوي، دافئ وواضح.
    عندما يضغط المستخدم على "اسأل"، قدم وصفاً دقيقاً للمكان لمدة 10 ثوانٍ.
    صف العوائق، المسارات المفتوحة، والأشخاص المحيطين.
    في وضع الرصد العادي، ابقَ صامتاً لتوفير التركيز للمكفوف.
    اللغة: العربية (ar-SA).`;
  }, []);

  const resolveArabicVoice = useCallback(() => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    if (!synth) return null;
    const voices = synth.getVoices() || [];
    const preferred = voices.find(v => v.lang?.toLowerCase().startsWith('ar-sa') && /female|woman|feminine|an|ar/i.test(v.name));
    const anyArabic = voices.find(v => v.lang?.toLowerCase().startsWith('ar'));
    return preferred || anyArabic || null;
  }, []);

  useEffect(() => {
    const updateVoice = () => { speechVoiceRef.current = resolveArabicVoice(); };
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.addEventListener('voiceschanged', updateVoice);
      updateVoice();
    }
    return () => { window.speechSynthesis?.removeEventListener('voiceschanged', updateVoice); };
  }, [resolveArabicVoice]);

  const speakLine = useCallback((text: string, onEnd?: () => void) => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    if (!synth) return;
    try {
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ar-SA';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      speechVoiceRef.current = speechVoiceRef.current || resolveArabicVoice();
      if (speechVoiceRef.current) utterance.voice = speechVoiceRef.current;
      utterance.onend = () => { onEnd?.(); };
      synth.speak(utterance);
    } catch (e) { console.warn(e); }
  }, [resolveArabicVoice]);

  const speakUI = (text: string) => speakLine(text);

  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { isReportingRef.current = isReporting; }, [isReporting]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) {
      setApiKeyInput(stored);
      setHasSavedKey(true);
    }
  }, []);

  const startAssistant = async () => {
    setStatus('starting');
    setErrorStatus(null);
    speakUI("جاري تشغيل معبر، يرجى الانتظار");

    try {
      const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (import.meta as any).env?.VITE_API_KEY || (window as any).GEMINI_API_KEY || '';
      const manualKey = apiKeyInput.trim();
      const apiKey = manualKey || envKey;
      if (!apiKey) {
        setErrorStatus('الرجاء إدخال مفتاح Gemini أولاً');
        setStatus('idle');
        speakUI('الرجاء إدخال مفتاح جيمني ثم الضغط على حفظ');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      streamRef.current = stream;

      if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      if (!outputAudioContextRef.current) outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      await audioContextRef.current.resume();
      await outputAudioContextRef.current.resume();
      playWelcomeChime(outputAudioContextRef.current);

      const ai = new GoogleGenAI({ apiKey });
      const sessionPromise = ai.live.connect({
        model: MODEL_NAME,
        config: {
          responseModalities: [Modality.TEXT],
          systemInstruction: getSystemInstruction(),
        },
        callbacks: {
          onopen: () => {
            setStatus('active');
            if (videoRef.current) videoRef.current.srcObject = stream;

            const source = audioContextRef.current!.createMediaStreamSource(stream);
            const processor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
            processor.onaudioprocess = (e) => {
              if (statusRef.current !== 'active') return;
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
              const pcmData = encode(new Uint8Array(int16.buffer));
              sessionPromiseRef.current?.then(s => s.sendRealtimeInput({ media: { data: pcmData, mimeType: 'audio/pcm;rate=16000' } }));
            };
            source.connect(processor);
            processor.connect(audioContextRef.current!.destination);
            speakUI("تم تفعيل الكاميرا، ابدأ الحركة الآن");
          },
          onmessage: async (msg: LiveServerMessage) => {
            const parts = msg.serverContent?.modelTurn?.parts || [];
            const textPart = parts.find(p => (p as any).text)?.text as string | undefined;
            if (textPart && isReportingRef.current) {
              isReportingRef.current = false;
              speakLine(textPart, () => { setIsReporting(false); });
            }
          },
          onerror: () => { setErrorStatus("خطأ في الخادم"); stopAssistant(); },
          onclose: () => setStatus('idle'),
        }
      });

      sessionPromiseRef.current = sessionPromise;

      frameIntervalRef.current = window.setInterval(() => {
        if (statusRef.current !== 'active' || !videoRef.current || !canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;
        canvasRef.current.width = 320;
        canvasRef.current.height = 240;
        ctx.drawImage(videoRef.current, 0, 0, 320, 240);
        canvasRef.current.toBlob(async (blob) => {
          if (blob) {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = (reader.result as string).split(',')[1];
              sessionPromiseRef.current?.then(s => s.sendRealtimeInput({ media: { data: base64, mimeType: 'image/jpeg' } }));
            };
            reader.readAsDataURL(blob);
          }
        }, 'image/jpeg', JPEG_QUALITY);
      }, 1000 / FRAME_RATE);

    } catch (e) {
      setErrorStatus("فشل الوصول للأذونات");
      setStatus('idle');
    }
  };

  const handleAsk = () => {
    if (statusRef.current !== 'active' || isReportingRef.current) return;
    setIsReporting(true);
    speakUI("جاري التحليل");
    sessionPromiseRef.current?.then(s => s.sendRealtimeInput({ text: "صف ما تراه الآن بدقة وباختصار لمدة 10 ثوانٍ متواصلة باللغة العربية، مع التركيز على العوائق، المسارات المفتوحة، والأشخاص." }));
  };

  const togglePause = () => {
    if (statusRef.current === 'active') { setStatus('paused'); speakUI("توقف مؤقت"); }
    else if (statusRef.current === 'paused') { setStatus('active'); speakUI("استئناف"); }
  };

  const handleSaveKey = () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      setErrorStatus('أدخل مفتاح Gemini ثم اضغط حفظ');
      speakUI('أدخل مفتاح جيمني ثم اضغط حفظ');
      return;
    }
    window.localStorage.setItem(LOCAL_STORAGE_KEY, trimmed);
    setApiKeyInput(trimmed);
    setHasSavedKey(true);
    setErrorStatus(null);
    speakUI('تم حفظ المفتاح، يمكنك البدء الآن');
  };

  const handleClearKey = () => {
    window.localStorage.removeItem(LOCAL_STORAGE_KEY);
    setApiKeyInput('');
    setHasSavedKey(false);
    speakUI('تم مسح المفتاح');
  };

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      stopAssistant(true);
    };
  }, [stopAssistant]);

  const stopAssistant = useCallback((silent = false) => {
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    sessionPromiseRef.current?.then(s => s.close()).catch(() => {});
    sessionPromiseRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    audioContextRef.current?.suspend().catch(() => {});
    outputAudioContextRef.current?.suspend().catch(() => {});
    audioSourcesRef.current.forEach(s => s.stop());
    audioSourcesRef.current.clear();
    if (!silent) speakUI("إغلاق");
    window.speechSynthesis?.cancel();
    if (isMountedRef.current) {
      setIsReporting(false);
      setStatus('idle');
    }
  }, [speakUI]);

  return (
    <div className="relative h-[100dvh] w-full bg-slate-950 flex flex-col overflow-hidden text-slate-100 safe-top safe-bottom">
      
      {/* الكاميرا */}
      <div className="fixed inset-0 z-0 bg-black">
        <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover transition-opacity duration-700 ${status === 'active' || status === 'paused' ? 'opacity-40' : 'opacity-0'}`} />
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {errorStatus && (
        <div className="absolute z-20 inset-x-4 bottom-6">
          <div className="bg-red-600 text-white text-2xl font-bold py-4 px-6 rounded-3xl text-center shadow-2xl border border-red-300/70">
            {errorStatus}
          </div>
        </div>
      )}

      {status === 'idle' ? (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-8 animate-in fade-in">
          <MabarLogo size="w-64 h-64" />
          <h1 className="text-8xl font-black mt-8 text-white">مَعْبَر</h1>
          <p className="text-teal-400 text-3xl font-bold mt-2">عينُك في كل مكان</p>
          
          <div className="w-full max-w-2xl mt-10 bg-slate-900/80 border border-white/10 rounded-3xl p-6 shadow-xl flex flex-col gap-4">
            <label className="text-2xl font-bold text-white flex items-center justify-between gap-4">
              <span>أدخل مفتاح Gemini</span>
              {hasSavedKey && <span className="text-sm bg-emerald-600 text-white px-3 py-1 rounded-full">محفوظ محلياً</span>}
            </label>
            <input
              type="password"
              inputMode="text"
              className="w-full text-2xl p-4 rounded-2xl bg-slate-800 border border-white/10 text-white placeholder:text-slate-400"
              placeholder="ضع المفتاح هنا..."
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
            />
            <div className="flex flex-wrap gap-4 justify-between items-center">
              <button onClick={handleSaveKey} className="flex-1 min-w-[200px] bg-teal-600 hover:bg-teal-500 text-white text-2xl font-black py-4 rounded-2xl border-b-[8px] border-teal-800 active:translate-y-1 active:border-b-0 transition-all">حفظ المفتاح</button>
              <button onClick={handleClearKey} className="flex-1 min-w-[200px] bg-slate-700 hover:bg-slate-600 text-white text-2xl font-black py-4 rounded-2xl border-b-[8px] border-slate-900 active:translate-y-1 active:border-b-0 transition-all">مسح المفتاح</button>
            </div>
            <p className="text-lg text-slate-300 leading-relaxed">يُخزَّن المفتاح في جهازك فقط (LocalStorage). لن يبدأ المسح بدون مفتاح.</p>
          </div>
          
          <button
            onClick={startAssistant}
            disabled={!apiKeyInput.trim()}
            className={`mt-20 w-full max-w-md text-white text-6xl font-black py-16 rounded-[4rem] shadow-2xl border-b-[16px] active:translate-y-2 active:border-b-0 transition-all ${apiKeyInput.trim() ? 'bg-teal-600 hover:bg-teal-500 border-teal-800' : 'bg-slate-700 border-slate-900 opacity-80 cursor-not-allowed'}`}
          >
            ابدأ المسح
          </button>
        </div>
      ) : status === 'starting' ? (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center">
          <div className="w-40 h-40 border-[16px] border-teal-600/20 border-t-teal-500 rounded-full animate-spin"></div>
          <p className="text-4xl font-black mt-8">جاري التحميل...</p>
        </div>
      ) : (
        <div className="relative z-10 flex-1 flex flex-col h-full">
          {/* الهيدر: الشعار بجانب الاسم جهة اليمين */}
          <div className="flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-2xl border-b border-white/10">
            <div className="flex items-center gap-6">
              <span className="text-5xl font-black">مَعْبَر</span>
              <MabarLogo size="w-16 h-16" />
            </div>
          </div>

          {/* زر اسأل - في المنتصف */}
          <div className="flex-1 flex flex-col items-center justify-center p-4">
            <button onClick={handleAsk} disabled={isReporting} className={`w-80 h-80 rounded-full shadow-2xl transition-all active:scale-90 border-[20px] flex flex-col items-center justify-center gap-4 ${isReporting ? 'bg-slate-800 border-teal-500 animate-pulse' : 'bg-teal-600 border-teal-400'}`}>
              <i className={`fa-solid ${isReporting ? 'fa-hourglass-half' : 'fa-microphone'} text-9xl text-white`}></i>
              <span className="text-5xl font-black text-white">اسأل</span>
            </button>
          </div>

          {/* أزرار التحكم - موزعة كما في الطلب */}
          <div className="grid grid-cols-2 gap-8 p-8 bg-slate-950/90 border-t border-white/10 pb-16">
            
            {/* زر الإغلاق (يمين) */}
            <button onClick={stopAssistant} className="h-44 bg-red-600 border-red-800 border-b-[12px] rounded-[3rem] text-white text-5xl font-black active:translate-y-2 active:border-b-0 transition-all">
              <i className="fa-solid fa-power-off mb-2"></i><br/>إغلاق
            </button>

            {/* زر الإيقاف (يسار) */}
            <button onClick={togglePause} className={`h-44 border-b-[12px] rounded-[3rem] text-white text-5xl font-black active:translate-y-2 active:border-b-0 transition-all ${status === 'paused' ? 'bg-teal-600 border-teal-800' : 'bg-orange-600 border-orange-800'}`}>
              <i className={`fa-solid ${status === 'paused' ? 'fa-play' : 'fa-pause'} mb-2`}></i><br/>
              {status === 'paused' ? 'استئناف' : 'إيقاف'}
            </button>

          </div>
        </div>
      )}
    </div>
  );
};

export default App;
