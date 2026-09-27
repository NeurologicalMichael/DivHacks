export function BrandMark({ onClick }: { onClick?: () => void }) {
  const inner = (
    <>
      <img src="/leaselens-mark-logo.png" alt="" width={44} height={44} />
      <span>LeaseLens</span>
    </>
  );
  if (onClick) {
    return (
      <button type="button" className="brand" onClick={onClick}>
        {inner}
      </button>
    );
  }
  return <div className="brand">{inner}</div>;
}
