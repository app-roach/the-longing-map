from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
from UnityPy.helpers.TypeTreeNode import TypeTreeNode
class FixedGen(TypeTreeGenerator):
    def get_nodes_up(self, assembly, fullname):
        key=(assembly, fullname)
        if key in self.cache: return self.cache[key]
        if not assembly.endswith(".dll"): assembly=f"{assembly}.dll"
        base=self.get_nodes(assembly, fullname)
        nodes=[]
        for b in base:
            mf=b.m_MetaFlag
            if b.m_Level==1 and b.m_Name=="m_Enabled": mf|=0x4000
            nodes.append(TypeTreeNode(b.m_Level,b.m_Type,b.m_Name,0,0,m_MetaFlag=mf))
        node=TypeTreeNode.from_list(nodes)
        self.cache[key]=node
        return node
