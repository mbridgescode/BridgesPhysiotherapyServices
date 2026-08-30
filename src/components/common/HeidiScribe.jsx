import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import MicNoneIcon from '@mui/icons-material/MicNone';
import apiClient from '../../utils/apiClient';

let heidiWidgetScriptPromise = null;
let heidiWidgetScriptUrl = '';
let heidiTargetCounter = 0;

const getHeidiApi = () => (
  typeof window !== 'undefined' ? window.Heidi : null
);

const callHeidiMethod = (instanceRef, methodName, ...args) => {
  const globalApi = getHeidiApi();
  if (globalApi && typeof globalApi[methodName] === 'function') {
    return globalApi[methodName](...args);
  }

  const instance = instanceRef.current;
  if (instance && typeof instance[methodName] === 'function') {
    return instance[methodName](...args);
  }

  return undefined;
};

const loadHeidiWidgetScript = (scriptUrl) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Heidi can only be opened in a browser.'));
  }

  if (getHeidiApi()) {
    return Promise.resolve();
  }

  if (heidiWidgetScriptPromise && heidiWidgetScriptUrl === scriptUrl) {
    return heidiWidgetScriptPromise;
  }

  heidiWidgetScriptUrl = scriptUrl;
  heidiWidgetScriptPromise = new Promise((resolve, reject) => {
    const existingScript = Array.from(document.scripts).find(
      (script) => script.dataset.heidiWidget === 'true' && script.src === scriptUrl,
    );
    const script = existingScript || document.createElement('script');

    const handleLoad = () => {
      if (getHeidiApi()) {
        resolve();
        return;
      }
      reject(new Error('Heidi loaded without exposing its widget API.'));
    };
    const handleError = () => reject(new Error('Heidi could not be loaded.'));

    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });

    if (!existingScript) {
      script.async = true;
      script.src = scriptUrl;
      script.dataset.heidiWidget = 'true';
      document.head.appendChild(script);
    }
  }).catch((error) => {
    heidiWidgetScriptPromise = null;
    heidiWidgetScriptUrl = '';
    throw error;
  });

  return heidiWidgetScriptPromise;
};

const toDateOnly = (value) => {
  if (!value) {
    return undefined;
  }

  const stringValue = String(value);
  const dateOnly = stringValue.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (dateOnly) {
    return dateOnly;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? undefined
    : parsed.toISOString().slice(0, 10);
};

const normalizeGender = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['male', 'female', 'other', 'unknown'].includes(normalized)) {
    return normalized;
  }
  return undefined;
};

const buildPatientInfo = (patient, appointment) => {
  const firstName = patient?.first_name || appointment?.first_name || '';
  const lastName = patient?.surname || appointment?.surname || '';
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  const patientId = patient?.patient_id ?? appointment?.patient_id ?? appointment?.appointment_id;

  return {
    id: String(patientId || 'unknown-patient'),
    name: name || 'Patient',
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    gender: normalizeGender(patient?.gender),
    dob: toDateOnly(patient?.date_of_birth),
  };
};

const buildSessionContext = (appointment) => {
  if (!appointment) {
    return '';
  }

  const context = [
    appointment.treatment_description
      ? `Appointment type: ${appointment.treatment_description}`
      : '',
    appointment.duration_minutes
      ? `Scheduled duration: ${appointment.duration_minutes} minutes`
      : '',
  ].filter(Boolean);

  const existingNotes = typeof appointment.treatment_notes === 'string'
    ? appointment.treatment_notes.trim()
    : '';
  if (existingNotes) {
    context.push(
      'Existing local treatment notes (review and update only when supported by this visit):',
      existingNotes,
    );
  }

  return context.join('\n');
};

const formatStructuredNote = (value) => {
  if (!value || typeof value !== 'object') {
    return '';
  }

  const lines = [];
  if (typeof value.content === 'string' && value.content.trim()) {
    lines.push(value.content.trim());
  }
  if (typeof value.summary === 'string' && value.summary.trim()) {
    lines.push(value.summary.trim());
  }
  if (Array.isArray(value.questionAnswers)) {
    value.questionAnswers.forEach((question) => {
      const questionText = question?.question || question?.questionId;
      const answers = Array.isArray(question?.answer)
        ? question.answer
          .map((answer) => [answer?.value, answer?.additionalDetails].filter(Boolean).join(': '))
          .filter(Boolean)
          .join(', ')
        : '';
      if (questionText && answers) {
        lines.push(`${questionText}: ${answers}`);
      }
    });
  }
  if (Array.isArray(value.sections)) {
    value.sections.forEach((section) => {
      if (section?.content) {
        lines.push(section.section_name ? `${section.section_name}\n${section.content}` : section.content);
      }
    });
  }

  return lines.join('\n\n').trim();
};

const extractNoteText = (data) => {
  const noteData = data?.noteData ?? data?.notesData ?? data?.note;
  if (typeof noteData === 'string') {
    return noteData.trim();
  }

  const structuredNote = formatStructuredNote(noteData);
  if (structuredNote) {
    return structuredNote;
  }

  if (data?.sectionalData?.data && Array.isArray(data.sectionalData.data)) {
    return data.sectionalData.data
      .map((section) => section?.section_name
        ? `${section.section_name}\n${section.content || ''}`
        : section?.content || '')
      .filter(Boolean)
      .join('\n\n')
      .trim();
  }

  return '';
};

const getApiErrorMessage = (error) => (
  error?.response?.data?.message
  || error?.message
  || 'Heidi could not be opened.'
);

const HeidiScribe = ({
  patient,
  appointment,
  onNoteGenerated,
  disabled = false,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [open, setOpen] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [recordingStatus, setRecordingStatus] = useState('');
  const [sessionId, setSessionId] = useState('');
  const widgetRef = useRef(null);
  const callbacksRegisteredRef = useRef(false);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const onNoteGeneratedRef = useRef(onNoteGenerated);
  const targetId = useMemo(() => {
    heidiTargetCounter += 1;
    return `heidi-widget-${heidiTargetCounter}`;
  }, []);

  const patientInfo = useMemo(
    () => buildPatientInfo(patient, appointment),
    [appointment, patient],
  );
  const sessionContext = useMemo(
    () => buildSessionContext(appointment),
    [appointment],
  );

  useEffect(() => {
    onNoteGeneratedRef.current = onNoteGenerated;
  }, [onNoteGenerated]);

  const fetchToken = useCallback(async () => {
    const response = await apiClient.get('/api/heidi/token');
    if (!response.data?.token) {
      throw new Error('Heidi did not return an authentication token.');
    }
    return response.data;
  }, []);

  const refreshToken = useCallback(async () => {
    try {
      const tokenData = await fetchToken();
      callHeidiMethod(widgetRef, 'setToken', tokenData.token);
      return tokenData.token;
    } catch (tokenError) {
      if (mountedRef.current) {
        setError(getApiErrorMessage(tokenError));
      }
      throw tokenError;
    }
  }, [fetchToken]);

  const handlePushData = useCallback((data) => {
    if (!mountedRef.current) {
      return;
    }

    const noteText = extractNoteText(data);
    if (!noteText) {
      setError('Heidi returned no note text. You can continue in Heidi or close this window.');
      return;
    }

    setError('');
    setStatus('Note received. Review it in the treatment-note editor before saving.');
    if (typeof onNoteGeneratedRef.current === 'function') {
      onNoteGeneratedRef.current(noteText, data);
    }
  }, []);

  const registerCallbacks = useCallback(() => {
    if (callbacksRegisteredRef.current) {
      return;
    }

    const api = getHeidiApi();
    if (!api || typeof api.onPushData !== 'function') {
      return;
    }

    api.onPushData(handlePushData);
    if (typeof api.onSessionStarted === 'function') {
      api.onSessionStarted((nextSessionId) => {
        if (mountedRef.current) {
          setSessionId(nextSessionId || '');
        }
      });
    }
    if (typeof api.onRecordingStatusChange === 'function') {
      api.onRecordingStatusChange((nextStatus) => {
        if (mountedRef.current) {
          setRecordingStatus(nextStatus || '');
        }
      });
    }
    callbacksRegisteredRef.current = true;
  }, [handlePushData]);

  const openHeidiSession = useCallback(async () => {
    const tokenData = await fetchToken();
    if (!mountedRef.current) {
      return;
    }

    await loadHeidiWidgetScript(tokenData.widgetUrl);
    const HeidiConstructor = getHeidiApi();
    if (!HeidiConstructor) {
      throw new Error('Heidi is unavailable in this browser.');
    }

    if (!widgetRef.current) {
      if (typeof HeidiConstructor === 'function') {
        widgetRef.current = new HeidiConstructor({
          token: tokenData.token,
          target: `#${targetId}`,
          region: tokenData.region,
          displayLanguage: 'en',
          productName: tokenData.productName,
          display: {
            position: 'bottom-right',
            theme: 'light',
            maxHeight: isMobile ? 600 : 720,
            zIndex: 1400,
          },
          language: {
            inputDefault: 'en',
            outputDefault: 'en',
          },
          // Standard notes do not include the raw transcript in the app record.
          result: { includeTranscript: false },
          onInit: () => {
            registerCallbacks();
          },
          onReady: () => {
            registerCallbacks();
            if (mountedRef.current) {
              setInitializing(false);
              setStatus('Heidi is ready. Start or continue the visit in the widget.');
            }
          },
          onTokenExpired: refreshToken,
        });
      } else if (typeof HeidiConstructor.open === 'function') {
        // Some Heidi builds expose an already-created controller globally.
        widgetRef.current = HeidiConstructor;
      } else {
        throw new Error('Heidi returned an invalid widget constructor.');
      }
    } else {
      callHeidiMethod(widgetRef, 'setToken', tokenData.token);
    }

    registerCallbacks();
    callHeidiMethod(widgetRef, 'setPatient', patientInfo);
    if (sessionContext) {
      callHeidiMethod(widgetRef, 'setContext', {
        context: sessionContext,
        mode: 'overwrite',
      });
    }

    const api = getHeidiApi();
    const instance = widgetRef.current;
    if (
      (!api || typeof api.open !== 'function')
      && (!instance || typeof instance.open !== 'function')
    ) {
      throw new Error('Heidi did not expose its open method.');
    }

    callHeidiMethod(widgetRef, 'open', {
      patient: patientInfo,
      context: sessionContext,
      startNewSession: true,
    });
  }, [
    fetchToken,
    isMobile,
    patientInfo,
    refreshToken,
    registerCallbacks,
    sessionContext,
    targetId,
  ]);

  const handleStart = useCallback(async () => {
    if (disabled || initializing) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setOpen(true);
    setInitializing(true);
    setError('');
    setStatus('Connecting to Heidi...');
    setRecordingStatus('');

    try {
      await openHeidiSession();
      if (mountedRef.current && requestIdRef.current === requestId) {
        setInitializing(false);
      }
    } catch (startError) {
      if (mountedRef.current && requestIdRef.current === requestId) {
        setInitializing(false);
        setError(getApiErrorMessage(startError));
        setStatus('');
      }
    }
  }, [disabled, initializing, openHeidiSession]);

  const handleClose = useCallback(() => {
    requestIdRef.current += 1;
    callHeidiMethod(widgetRef, 'close', { keepSession: true, force: true });
    setOpen(false);
    setInitializing(false);
    setRecordingStatus('');
  }, []);

  useEffect(() => () => {
    mountedRef.current = false;
    requestIdRef.current += 1;
    callHeidiMethod(widgetRef, 'close', { keepSession: true, force: true });
  }, []);

  return (
    <>
      <Button
        variant="outlined"
        color="secondary"
        startIcon={initializing ? <CircularProgress size={16} color="inherit" /> : <MicNoneIcon />}
        onClick={handleStart}
        disabled={disabled || initializing}
      >
        {initializing ? 'Opening Heidi...' : 'Use Heidi Scribe'}
      </Button>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>Heidi Scribe</DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 2 }}>
            This uses Heidi&apos;s standard note workflow. Review the generated note in Bridges before saving it to the patient record.
          </Alert>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {status && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {status}
              {recordingStatus ? ` Recording: ${recordingStatus.toLowerCase()}.` : ''}
              {sessionId ? ' Session connected.' : ''}
            </Typography>
          )}
          <Box
            id={targetId}
            sx={{
              minHeight: isMobile ? 420 : 520,
              width: '100%',
              position: 'relative',
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} sx={{ color: '#fff' }}>
            Close Heidi
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default HeidiScribe;
