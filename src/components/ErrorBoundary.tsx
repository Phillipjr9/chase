import React from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Keeps a render error from blanking the whole experience. Chase's own banking
 * flow shows a recovery screen rather than an empty page.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Chase Online render error:', error, info.componentStack);
  }

  private reload = () => window.location.reload();

  private goHome = () => {
    this.setState({ error: null });
    window.location.hash = '';
    window.scrollTo({ top: 0 });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen bg-[#F1F1F0] flex items-center justify-center p-5">
        <div className="max-w-[520px] w-full bg-white border border-[#E4E6E8] rounded-[6px] p-7 text-center">
          <span className="mx-auto w-12 h-12 rounded-full bg-[#FEF2F2] flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-[#B42318]" />
          </span>
          <h1 className="mt-4 text-[22px] font-light text-[#131313]">
            Something went wrong on this page
          </h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-[#5C5C5C]">
            Your accounts and local data are still saved. Reload to continue, or return to the
            homepage and sign in again.
          </p>
          <pre className="mt-4 text-left text-[11.5px] leading-relaxed bg-[#F7F8F9] border border-[#E4E6E8] rounded-[4px] p-3 overflow-x-auto text-[#5C5C5C]">
            {error.message}
          </pre>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={this.reload}
              className="inline-flex items-center gap-2 bg-[#1A4488] hover:bg-[#143669] text-white text-[14px] font-semibold px-5 py-2.5 rounded-[4px] cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" /> Reload page
            </button>
            <button
              type="button"
              onClick={this.goHome}
              className="inline-flex items-center gap-2 border border-[#1A4488] bg-white hover:bg-[#F2F6FB] text-[#1A4488] text-[14px] font-semibold px-5 py-2.5 rounded-[4px] cursor-pointer"
            >
              <Home className="w-4 h-4" /> Back to homepage
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
