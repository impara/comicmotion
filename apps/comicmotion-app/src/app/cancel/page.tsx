export default function CancelPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8">
      <h1 className="text-3xl font-bold text-red-700 mb-4">Payment Canceled</h1>
      <p className="text-lg">Your payment was canceled. No charges were made. You can try subscribing again at any time.</p>
    </div>
  );
} 